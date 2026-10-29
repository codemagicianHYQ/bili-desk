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
import { useAppStore } from "@/stores/app-store";

export type { TagListCache };

const FOLLOWINGS_TTL_MS = 10 * 60 * 1000;

interface FollowingState {
  allFollowings: FollowingUp[] | null;
  followingsLoadedAt: number | null;
  followingsLoading: boolean;
  /** 正在从 B 站拉全量关注时已拿到的人数 */
  followingsProgress: number;
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
  onPage?: (page: number, fetched: number) => void,
): Promise<FollowingUp[]> {
  const all: FollowingUp[] = [];
  const seen = new Set<number>();
  let page = 1;

  while (page <= 200) {
    const batch = await window.biliDesk.bili.getFollowings(page, order);
    onPage?.(page, all.length + batch.length);
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return all;
}

/** 全量关注要翻几十页，存一份到本地，下次打开先用它秒开，再后台同步 */
const SNAPSHOT_KEY_PREFIX = "bilidesk:followings-snapshot:";
let followingsSync: Promise<FollowingUp[]> | null = null;

function snapshotKey(): string | null {
  const mid = useAppStore.getState().user?.mid;
  return mid ? `${SNAPSHOT_KEY_PREFIX}${mid}` : null;
}

function readFollowingsSnapshot(): FollowingUp[] | null {
  const key = snapshotKey();
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as {
      list?: FollowingUp[];
    } | null;
    return Array.isArray(parsed?.list) && parsed.list.length > 0
      ? parsed.list
      : null;
  } catch {
    return null;
  }
}

function writeFollowingsSnapshot(list: FollowingUp[]): void {
  const key = snapshotKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), list }));
  } catch {
    // 配额满了就不存，下次照常走网络
  }
}

export function clearFollowingsSnapshots(): void {
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith(SNAPSHOT_KEY_PREFIX)) localStorage.removeItem(key);
  }
}

function sameMids(a: FollowingUp[], b: FollowingUp[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map((up) => up.mid));
  return b.every((up) => set.has(up.mid));
}

/** 按 mid 比对：本地分组里可能有已取关的 UP，不能直接用数量相减 */
async function countUncategorized(all: FollowingUp[]): Promise<number> {
  const assigned = new Set(
    await window.biliDesk.taxonomy.getUpGroupMemberMids({
      level: "all",
      id: null,
    }),
  );
  return all.filter((up) => !assigned.has(up.mid)).length;
}

export const useFollowingStore = create<FollowingState>((set, get) => ({
  allFollowings: null,
  followingsLoadedAt: null,
  followingsLoading: false,
  followingsProgress: 0,
  followTags: [],
  upGroupTree: [],
  uncategorizedCount: 0,
  sidebarReady: false,
  refreshing: false,
  refreshVersion: 0,
  attentionRank: null,

  ensureAllFollowings: async ({ force = false } = {}) => {
    const { allFollowings, followingsLoadedAt } = get();
    const fresh =
      allFollowings &&
      followingsLoadedAt != null &&
      Date.now() - followingsLoadedAt < FOLLOWINGS_TTL_MS;

    if (!force && fresh && allFollowings) return allFollowings;

    const sync = (): Promise<FollowingUp[]> => {
      if (followingsSync) return followingsSync;
      const previous = get().allFollowings;
      set({ followingsLoading: true, followingsProgress: 0 });
      followingsSync = fetchAllFollowingsFromApi("recent", (_page, fetched) =>
        set({ followingsProgress: fetched }),
      )
        .then((next) => {
          if (next.length === 0) {
            throw new Error(
              "B 站返回的关注列表是空的，可能被限流了，稍后点刷新重试",
            );
          }
          set({
            allFollowings: next,
            followingsLoadedAt: Date.now(),
            followingsLoading: false,
          });
          writeFollowingsSnapshot(next);
          void countUncategorized(next)
            .then((uncategorizedCount) => set({ uncategorizedCount }))
            .catch(() => undefined);
          // 后台同步出了变化（新关注 / 取关），让当前列表重新筛一遍
          if (previous && !sameMids(previous, next)) {
            set((state) => ({ refreshVersion: state.refreshVersion + 1 }));
          }
          return next;
        })
        .catch((error: unknown) => {
          set({ followingsLoading: false });
          throw error;
        })
        .finally(() => {
          followingsSync = null;
        });
      return followingsSync;
    };

    if (force) return sync();

    // 先用手上的（内存或本地快照）秒开，再后台和 B 站对一遍；空列表不算数
    const local =
      allFollowings && allFollowings.length > 0
        ? allFollowings
        : readFollowingsSnapshot();
    if (local) {
      if (local !== allFollowings) {
        set({ allFollowings: local, followingsLoadedAt: null });
        void countUncategorized(local)
          .then((uncategorizedCount) => set({ uncategorizedCount }))
          .catch(() => undefined);
      }
      void sync().catch(() => undefined);
      return local;
    }

    return sync();
  },

  refreshSidebar: async ({ force = false } = {}) => {
    const { sidebarReady } = get();
    if (!force && sidebarReady) {
      const all = get().allFollowings;
      if (all) set({ uncategorizedCount: await countUncategorized(all) });
      return;
    }

    const [tags, tree] = await Promise.all([
      window.biliDesk.bili.getFollowTags(),
      window.biliDesk.taxonomy.getUpGroupTree(),
    ]);
    const all = get().allFollowings;
    const uncategorizedCount = all
      ? await countUncategorized(all)
      : get().uncategorizedCount;

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
      const list = all.filter((up) => !assignedSet.has(up.mid));
      set({ uncategorizedCount: list.length });
      return list;
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

    const next =
      patch == null
        ? allFollowings.filter((up) => up.mid !== mid)
        : allFollowings.map((up) =>
            up.mid === mid ? { ...up, ...patch } : up,
          );
    set({ allFollowings: next });
    writeFollowingsSnapshot(next);
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
