import { create } from 'zustand'
import type { FollowTag, FollowingUp, UpGroupSelection, UpGroupTreeNode } from '@shared/types'

const FOLLOWINGS_TTL_MS = 10 * 60 * 1000

interface FollowingState {
  allFollowings: FollowingUp[] | null
  followingsLoadedAt: number | null
  followingsLoading: boolean
  followTags: FollowTag[]
  upGroupTree: UpGroupTreeNode[]
  uncategorizedCount: number
  sidebarReady: boolean
  ensureAllFollowings: (options?: { force?: boolean }) => Promise<FollowingUp[]>
  refreshSidebar: (options?: { force?: boolean }) => Promise<void>
  filterLocalFollowings: (selection: UpGroupSelection) => Promise<FollowingUp[]>
  invalidateFollowings: () => void
  invalidateSidebar: () => void
  patchFollowing: (mid: number, patch: Partial<FollowingUp> | null) => void
}

async function fetchAllFollowingsFromApi(): Promise<FollowingUp[]> {
  const all: FollowingUp[] = []
  let page = 1

  while (true) {
    const batch = await window.biliDesk.bili.getFollowings(page)
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < 50) break
    page++
  }

  return all
}

export const useFollowingStore = create<FollowingState>((set, get) => ({
  allFollowings: null,
  followingsLoadedAt: null,
  followingsLoading: false,
  followTags: [],
  upGroupTree: [],
  uncategorizedCount: 0,
  sidebarReady: false,

  ensureAllFollowings: async ({ force = false } = {}) => {
    const { allFollowings, followingsLoadedAt, followingsLoading } = get()
    const fresh =
      allFollowings &&
      followingsLoadedAt != null &&
      Date.now() - followingsLoadedAt < FOLLOWINGS_TTL_MS

    if (!force && fresh && allFollowings) {
      return allFollowings
    }

    if (followingsLoading && allFollowings) {
      return allFollowings
    }

    set({ followingsLoading: true })
    try {
      const next = await fetchAllFollowingsFromApi()
      set({
        allFollowings: next,
        followingsLoadedAt: Date.now(),
        followingsLoading: false
      })
      return next
    } catch (error) {
      set({ followingsLoading: false })
      if (allFollowings) return allFollowings
      throw error
    }
  },

  refreshSidebar: async ({ force = false } = {}) => {
    const { sidebarReady } = get()
    if (!force && sidebarReady) {
      const all = get().allFollowings
      if (all) {
        const assignedMids = await window.biliDesk.taxonomy.getUpGroupMemberMids({ level: 'all', id: null })
        set({ uncategorizedCount: Math.max(0, all.length - assignedMids.length) })
      }
      return
    }

    const [tags, tree, all] = await Promise.all([
      window.biliDesk.bili.getFollowTags(),
      window.biliDesk.taxonomy.getUpGroupTree(),
      get().ensureAllFollowings({ force })
    ])
    const assignedMids = await window.biliDesk.taxonomy.getUpGroupMemberMids({ level: 'all', id: null })

    set({
      followTags: tags,
      upGroupTree: tree,
      uncategorizedCount: Math.max(0, all.length - assignedMids.length),
      sidebarReady: true
    })
  },

  filterLocalFollowings: async (selection) => {
    const all = await get().ensureAllFollowings()

    if (selection.level === 'uncategorized') {
      const assignedMids = await window.biliDesk.taxonomy.getUpGroupMemberMids({ level: 'all', id: null })
      const assignedSet = new Set(assignedMids)
      return all.filter((up) => !assignedSet.has(up.mid))
    }

    const mids = await window.biliDesk.taxonomy.getUpGroupMemberMids(selection)
    const midSet = new Set(mids)
    return all.filter((up) => midSet.has(up.mid))
  },

  invalidateFollowings: () => {
    set({ allFollowings: null, followingsLoadedAt: null })
  },

  invalidateSidebar: () => {
    set({ sidebarReady: false })
  },

  patchFollowing: (mid, patch) => {
    const { allFollowings } = get()
    if (!allFollowings) return

    if (patch == null) {
      set({ allFollowings: allFollowings.filter((up) => up.mid !== mid) })
      return
    }

    set({
      allFollowings: allFollowings.map((up) => (up.mid === mid ? { ...up, ...patch } : up))
    })
  }
}))
