import { useCallback, useEffect, useRef } from 'react'
import { useHomeFeedStore } from '@/stores/home-feed-store'
import { useAppStore } from '@/stores/app-store'
import { VideoCard } from '@/components/video/VideoCard'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRID_COLS_CLASS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5'
} as const

export function HomePage() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const homeGridColumns = useAppStore((state) => state.homeGridColumns)
  const {
    videos,
    hasMore,
    hydrated,
    loading,
    loadingMore,
    refreshing,
    error,
    fetchInitial,
    loadMore
  } = useHomeFeedStore()

  useEffect(() => {
    void fetchInitial()
  }, [fetchInitial])

  useEffect(() => {
    if (refreshing && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [refreshing])

  const handleLoadMore = useCallback(async () => {
    await loadMore()
  }, [loadMore])

  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !hasMore || loading || refreshing) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void handleLoadMore()
        }
      },
      { root, rootMargin: '240px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [handleLoadMore, hasMore, loading, refreshing, videos.length])

  if (!hydrated && loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">加载推荐中...</div>
    )
  }

  if (!hydrated && error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">{error}</div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className={cn('grid gap-4 p-6', GRID_COLS_CLASS[homeGridColumns])}>
        {videos.map((video) => (
          <VideoCard key={video.bvid} video={video} />
        ))}
      </div>

      <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        {refreshing || loadingMore ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {refreshing ? '正在刷新...' : '加载更多...'}
          </>
        ) : hasMore ? (
          '继续下滑加载更多'
        ) : videos.length > 0 ? (
          '已经到底啦'
        ) : (
          '暂无推荐内容'
        )}
      </div>

      {error && hydrated && (
        <p className="pb-6 text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
