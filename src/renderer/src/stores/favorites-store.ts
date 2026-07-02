import { create } from 'zustand'
import type { CategoryTreeNode, FavoriteItemAssignment, FavFolder } from '@shared/types'

interface FavoritesState {
  tree: CategoryTreeNode[]
  assignments: FavoriteItemAssignment[]
  folders: FavFolder[]
  taxonomyReady: boolean
  foldersReady: boolean
  coversEnriched: boolean
  refreshing: boolean
  refreshVersion: number
  ensureTaxonomy: (options?: { force?: boolean }) => Promise<void>
  ensureFolders: (options?: { force?: boolean }) => Promise<FavFolder[]>
  enrichCoversOnce: () => Promise<void>
  refresh: () => Promise<void>
  invalidateTaxonomy: () => void
  invalidateFolders: () => void
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  tree: [],
  assignments: [],
  folders: [],
  taxonomyReady: false,
  foldersReady: false,
  coversEnriched: false,
  refreshing: false,
  refreshVersion: 0,

  ensureTaxonomy: async ({ force = false } = {}) => {
    if (!force && get().taxonomyReady) return

    const [nextTree, nextAssignments] = await Promise.all([
      window.biliDesk.taxonomy.getTree(),
      window.biliDesk.taxonomy.getFavoriteAssignments()
    ])

    set({
      tree: nextTree,
      assignments: nextAssignments,
      taxonomyReady: true
    })
  },

  ensureFolders: async ({ force = false } = {}) => {
    if (!force && get().foldersReady) {
      return get().folders
    }

    const list = await window.biliDesk.bili.getFavFolders()
    set({ folders: list, foldersReady: true })
    return list
  },

  enrichCoversOnce: async () => {
    if (get().coversEnriched) return

    let remaining = 1
    let guard = 0

    while (remaining > 0 && guard < 20) {
      const result = await window.biliDesk.taxonomy.enrichFavoriteCovers()
      remaining = result.remaining
      guard++

      if (result.updated > 0) {
        const nextAssignments = await window.biliDesk.taxonomy.getFavoriteAssignments()
        set({ assignments: nextAssignments, taxonomyReady: true })
      }

      if (remaining === 0) break
    }

    set({ coversEnriched: true })
  },

  refresh: async () => {
    if (get().refreshing) return

    set({ refreshing: true, foldersReady: false, taxonomyReady: false })
    try {
      await Promise.all([get().ensureTaxonomy({ force: true }), get().ensureFolders({ force: true })])
      set((state) => ({ refreshVersion: state.refreshVersion + 1 }))
    } finally {
      set({ refreshing: false })
    }
  },

  invalidateTaxonomy: () => {
    set({ taxonomyReady: false, coversEnriched: false })
  },

  invalidateFolders: () => {
    set({ foldersReady: false })
  }
}))
