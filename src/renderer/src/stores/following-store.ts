import { create } from "zustand";
import {
  BILI_SPECIAL_FOLLOW_TAG_ID,
  type FollowTag,
  type FollowingOrder,
  type FollowingUp,
  type UpGroupSelection,
  type UpGroupTreeNode,
} from "@shared/types";
import { tagListCache, type TagListCache } from "@/lib/session-data-cache";

export type { TagListCache };

const FOLLOWINGS_TTL_MS = 10 * 60 * 1000;

interface FollowingState {
  allFollowings: FollowingUp[] | null;
  followingsLoadedAt: number | null;
  followingsLoading: boolean;
  followTags: FollowTag[];
  upGroupTree: UpGroupTreeNode[];
  uncategorizedCount: number;
  sidebarReady: boolean;
  refreshing: boolean;
  refreshVersion: number;
  ensureAllFollowings: (options?: {
    force?: boolean;
  }) => Promise<FollowingUp[]>;
  refreshSidebar: (options?: { force?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
  filterLocalFollowings: (
    selection: UpGroupSelection,
  ) => Promise<FollowingUp[]>;
  invalidateFollowings: () => void;
  invalidateSidebar: () => void;
  patchFollowing: (mid: number, patch: Partial<FollowingUp> | null) => void;
  patchFollowTagCount: (tagId: number, delta: number) => void;
  patchSpecialFollowCount: (delta: number) => void;
  refreshFollowTags: () => Promise<void>;
  addFollowTag: (tag: FollowTag) => void;
  renameFollowTagLocal: (tagId: number, name: string) => void;
  removeFollowTagLocal: (tagId: number) => void;
  reloadUpGroupTree: () => Promise<void>;
  /** mid → 官方「最常访问」名次，越小越常访问 */
  attentionRank: Map<number, number> | null;
  ensureAttentionRank: () => Promise<Map<number, number>>;
  /** key 为 tagId，或 `${tagId}:attention`（最常访问顺序） */
  getTagList: (key: number | string) => TagListCache | undefined;
  putTagList: (key: number | string, list: TagListCache) => void;
  removeMidFromTagLists: (mid: number) => void;
  clearTagList: (tagId: number) => void;
  clearTagLists: () => void;
}

async function fetchAllFollowingsFromApi(
  order: FollowingOrder = "recent",
): Promise<FollowingUp[]> {
  const all: FollowingUp[] = [];
  const seen = new Set<number>();
  let page = 1;

  while (page <= 200) {
    const batch = await window.biliDesk.bili.getFollowings(page, order);
    if (batch.length === 0) break;
    let fresh = 0;
    for (const up of batch) {
      if (seen.has(up.mid)) continue;
      seen.add(up.mid);
      all.push(up);
      fresh += 1;
    }
    if (fresh === 0 || batch.length < 50) break;
    page += 1;
  }

  return all;
}

export const useFollowingStore = create<FollowingState>((set, get) => ({
  allFollowings: null,
  followingsLoadedAt: null,
  followingsLoading: false,
  followTags: [],
  upGroupTree: [],
  uncategorizedCount: 0,
  sidebarReady: false,
  refreshing: false,
  refreshVersion: 0,
  attentionRank: null,

  ensureAllFollowings: async ({ force = false } = {}) => {
    const { allFollowings, followingsLoadedAt, followingsLoading } = get();
    const fresh =
      allFollowings &&
      followingsLoadedAt != null &&
      Date.now() - followingsLoadedAt < FOLLOWINGS_TTL_MS;

    if (!force && fresh && allFollowings) {
      return allFollowings;
    }

    if (followingsLoading && allFollowings) {
      return allFollowings;
    }

    set({ followingsLoading: true });
    try {
      const next = await fetchAllFollowingsFromApi();
      set({
        allFollowings: next,
        followingsLoadedAt: Date.now(),
        followingsLoading: false,
      });
      return next;
    } catch (error) {
      set({ followingsLoading: false });
      if (allFollowings) return allFollowings;
      throw error;
    }
  },

  refreshSidebar: async ({ force = false } = {}) => {
    const { sidebarReady } = get();
    if (!force && sidebarReady) {
      const all = get().allFollowings;
      if (all) {
        const assignedMids =
          await window.biliDesk.taxonomy.getUpGroupMemberMids({
            level: "all",
            id: null,
          });
        set({
          uncategorizedCount: Math.max(0, all.length - assignedMids.length),
        });
      }
      return;
    }

    const [tags, tree] = await Promise.all([
      window.biliDesk.bili.getFollowTags(),
      window.biliDesk.taxonomy.getUpGroupTree(),
    ]);
    const all = get().allFollowings;
    let uncategorizedCount = get().uncategorizedCount;
    if (all) {
      const assignedMids = await window.biliDesk.taxonomy.getUpGroupMemberMids({
        level: "all",
        id: null,
      });
      uncategorizedCount = Math.max(0, all.length - assignedMids.length);
    }

    set({
      followTags: tags,
      upGroupTree: tree,
      uncategorizedCount,
      sidebarReady: true,
    });
  },

  refresh: async () => {
    if (get().refreshing) return;

    set({ refreshing: true });
    try {
      get().invalidateFollowings();
      get().invalidateSidebar();
      await get().refreshSidebar({ force: true });
      set((state) => ({ refreshVersion: state.refreshVersion + 1 }));
    } finally {
      set({ refreshing: false });
    }
  },

  filterLocalFollowings: async (selection) => {
    const all = await get().ensureAllFollowings();

    if (selection.level === "uncategorized") {
      const assignedMids = await window.biliDesk.taxonomy.getUpGroupMemberMids({
        level: "all",
        id: null,
      });
      const assignedSet = new Set(assignedMids);
      return all.filter((up) => !assignedSet.has(up.mid));
    }

    const mids = await window.biliDesk.taxonomy.getUpGroupMemberMids(selection);
    const midSet = new Set(mids);
    return all.filter((up) => midSet.has(up.mid));
  },

  invalidateFollowings: () => {
    tagListCache.clear();
    set({ allFollowings: null, followingsLoadedAt: null, attentionRank: null });
  },

  ensureAttentionRank: async () => {
    const cached = get().attentionRank;
    if (cached) return cached;
    const list = await fetchAllFollowingsFromApi("attention");
    const rank = new Map(list.map((up, index) => [up.mid, index]));
    set({ attentionRank: rank });
    return rank;
  },

  renameFollowTagLocal: (tagId, name) => {
    set({
      followTags: get().followTags.map((tag) =>
        tag.tagId === tagId ? { ...tag, name } : tag,
      ),
    });
  },

  removeFollowTagLocal: (tagId) => {
    get().clearTagList(tagId);
    get().clearTagList(0);
    set({ followTags: get().followTags.filter((tag) => tag.tagId !== tagId) });
  },

  reloadUpGroupTree: async () => {
    set({ upGroupTree: await window.biliDesk.taxonomy.getUpGroupTree() });
  },

  invalidateSidebar: () => {
    set({ sidebarReady: false });
  },

  patchFollowing: (mid, patch) => {
    const { allFollowings } = get();
    if (!allFollowings) return;

    if (patch == null) {
      set({ allFollowings: allFollowings.filter((up) => up.mid !== mid) });
      return;
    }

    set({
      allFollowings: allFollowings.map((up) =>
        up.mid === mid ? { ...up, ...patch } : up,
      ),
    });
  },

  patchFollowTagCount: (tagId, delta) => {
    if (delta === 0 || tagId === 0) return;
    set({
      followTags: get().followTags.map((tag) =>
        tag.tagId === tagId
          ? { ...tag, count: Math.max(0, tag.count + delta) }
          : tag,
      ),
    });
  },

  patchSpecialFollowCount: (delta) => {
    if (delta === 0) return;
    const tags = get().followTags;
    const index = tags.findIndex(
      (tag) =>
        tag.name === "特别关注" || tag.tagId === BILI_SPECIAL_FOLLOW_TAG_ID,
    );
    if (index < 0) return;
    const target = tags[index];
    if (target.name === "默认分组") return;
    const next = tags.slice();
    next[index] = { ...target, count: Math.max(0, target.count + delta) };
    set({ followTags: next });
  },

  refreshFollowTags: async () => {
    const tags = await window.biliDesk.bili.getFollowTags();
    set({ followTags: tags });
  },

  addFollowTag: (tag) => {
    const tags = get().followTags;
    if (tags.some((item) => item.tagId === tag.tagId)) return;
    const system = tags.filter((item) => item.tagId <= 0);
    const custom = tags.filter((item) => item.tagId > 0);
    set({ followTags: [...system, ...custom, tag] });
  },

  putTagList: (key, list) => {
    tagListCache.set(String(key), list);
  },

  getTagList: (key) => tagListCache.get(String(key)),

  removeMidFromTagLists: (mid) => {
    tagListCache.forEach((list, key) => {
      tagListCache.set(key, {
        ...list,
        followings: list.followings.filter((up) => up.mid !== mid),
      });
    });
  },

  clearTagList: (tagId) => {
    tagListCache.delete(String(tagId));
    tagListCache.delete(`${tagId}:attention`);
  },

  clearTagLists: () => {
    tagListCache.clear();
  },
}));
