import { create } from 'zustand'
import type { VideoItem } from '@shared/types'

interface HomeFeedState {
  videos: VideoItem[]
  freshIdx: number
  hasMore: boolean
  hydrated: boolean
  loading: boolean
  loadingMore: boolean
  refreshing: boolean
  error: string
  fetchInitial: () => Promise<void>
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

function mergeVideos(prev: VideoItem[], next: VideoItem[]): VideoItem[] {
  const seen = new Set(prev.map((item) => item.bvid))
  const merged = [...prev]
  for (const item of next) {
    if (seen.has(item.bvid)) continue
    seen.add(item.bvid)
    merged.push(item)
  }
  return merged
}

export const useHomeFeedStore = create<HomeFeedState>((set, get) => ({
  videos: [],
  freshIdx: 1,
  hasMore: true,
  hydrated: false,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: '',

  fetchInitial: async () => {
    const { hydrated, loading } = get()
    if (hydrated || loading) return

    set({ loading: true, error: '' })
    try {
      const page = await window.biliDesk.bili.getRecommend({ freshIdx: 1, freshIdx1h: 1 })
      set({
        videos: page.videos,
        freshIdx: page.freshIdx,
        hasMore: page.hasMore,
        hydrated: true,
        loading: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载推荐失败',
        loading: false
      })
    }
  },

  loadMore: async () => {
    const { hasMore, loadingMore, loading, refreshing, freshIdx, videos } = get()
    if (!hasMore || loadingMore || loading || refreshing) return

    set({ loadingMore: true, error: '' })
    try {
      const page = await window.biliDesk.bili.getRecommend({ freshIdx, freshIdx1h: freshIdx })
      set({
        videos: mergeVideos(videos, page.videos),
        freshIdx: page.freshIdx,
        hasMore: page.hasMore,
        loadingMore: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载更多失败',
        loadingMore: false
      })
    }
  },

  refresh: async () => {
    const { refreshing } = get()
    if (refreshing) return

    set({
      refreshing: true,
      error: '',
      videos: [],
      freshIdx: 1,
      hasMore: true
    })

    try {
      const page = await window.biliDesk.bili.getRecommend({ freshIdx: 1, freshIdx1h: 1 })
      set({
        videos: page.videos,
        freshIdx: page.freshIdx,
        hasMore: page.hasMore,
        hydrated: true,
        refreshing: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '刷新失败',
        refreshing: false
      })
    }
  }
}))
