import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { UpProfile, UpRelation, VideoItem } from '@shared/types'
import { BiliImage } from '@/components/ui/bili-image'
import { FollowButton } from '@/components/video/FollowButton'
import { VideoCard } from '@/components/video/VideoCard'
import { PageBackHeader } from '@/components/layout/PageBackHeader'
import { formatCount } from '@/lib/utils'

function formatPageError(err: unknown): string {
  const message = err instanceof Error ? err.message : '加载失败'
  if (message.startsWith('Error invoking remote method')) {
    return '加载失败，请稍后重试'
  }
  return message
}

function parseMid(value: string | undefined): number {
  if (!value) return 0
  const mid = Number(value)
  return Number.isFinite(mid) && mid > 0 ? mid : 0
}

function normalizeUpVideosPage(data: unknown): {
  videos: VideoItem[]
  page: number
  hasMore: boolean
} {
  if (Array.isArray(data)) {
    return { videos: data, page: 1, hasMore: data.length >= 30 }
  }

  const payload = data as { videos?: VideoItem[]; page?: number; hasMore?: boolean }
  const videos = payload?.videos ?? []
  return {
    videos,
    page: payload?.page ?? 1,
    hasMore: payload?.hasMore ?? videos.length >= 30
  }
}

export function UpSpacePage() {
  const { mid: midParam } = useParams<{ mid: string }>()
  const mid = parseMid(midParam)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [profile, setProfile] = useState<UpProfile | null>(null)
  const [relation, setRelation] = useState<UpRelation | null>(null)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [videosError, setVideosError] = useState('')
  const [videosLoading, setVideosLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!mid) return

    let cancelled = false
    setProfileError('')
    setVideosError('')
    setVideosLoading(true)
    setProfile(null)
    setVideos([])
    setPage(1)
    setHasMore(false)

    void (async () => {
      let loadedProfile: UpProfile | null = null
      try {
        const upProfile = await window.biliDesk.bili.getUpProfile(mid)
        loadedProfile = upProfile
        if (cancelled) return
        setProfile(upProfile)

        const upRelation = await window.biliDesk.bili
          .getUpRelation(mid)
          .catch(() => ({ isFollowing: false, attribute: 0 }) as UpRelation)
        if (cancelled) return
        setRelation(upRelation)

        const upVideos = normalizeUpVideosPage(await window.biliDesk.bili.getUpVideos(mid, 1))
        if (cancelled) return
        setVideos(upVideos.videos)
        setPage(upVideos.page)
        setHasMore(upVideos.hasMore)
      } catch (e) {
        if (cancelled) return
        const message = formatPageError(e)
        if (loadedProfile) {
          setVideosError(message)
        } else {
          setProfileError(message)
        }
      } finally {
        if (!cancelled) setVideosLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mid])

  const loadMore = useCallback(async () => {
    if (!mid || !hasMore || loadingMore || videosLoading) return

    setLoadingMore(true)
    setVideosError('')
    try {
      const nextPage = page + 1
      const result = normalizeUpVideosPage(await window.biliDesk.bili.getUpVideos(mid, nextPage))
      setVideos((prev) => {
        const safePrev = prev ?? []
        const seen = new Set(safePrev.map((v) => v.bvid))
        const merged = [...safePrev]
        for (const item of result.videos) {
          if (!seen.has(item.bvid)) merged.push(item)
        }
        return merged
      })
      setPage(result.page)
      setHasMore(result.hasMore)
    } catch (e) {
      setVideosError(formatPageError(e))
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, mid, page, videosLoading])

  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore()
        }
      },
      { root, rootMargin: '200px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  const handleFollow = async () => {
    if (!relation) return
    setLoadingFollow(true)
    try {
      await window.biliDesk.bili.modifyFollow(mid, !relation.isFollowing)
      setRelation({ ...relation, isFollowing: !relation.isFollowing })
    } catch (e) {
      setProfileError(formatPageError(e))
    } finally {
      setLoadingFollow(false)
    }
  }

  if (!mid) {
    return <div className="flex h-full items-center justify-center text-red-400">无效的 UP 主 ID</div>
  }

  if (profileError && !profile) {
    return <div className="flex h-full items-center justify-center text-red-400">{profileError}</div>
  }

  if (!profile) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageBackHeader />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6 pt-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center">
            <BiliImage
              src={profile.face}
              alt={profile.name}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/30"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold">{profile.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCount(profile.fans)} 粉丝 · {formatCount(profile.following)} 关注 ·{' '}
                {formatCount(profile.videos)} 投稿
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {profile.sign || '这个人很懒，什么都没有写~'}
              </p>
            </div>
            <FollowButton
              size="default"
              isFollowing={relation?.isFollowing ?? false}
              loading={loadingFollow}
              disabled={!relation}
              onClick={() => void handleFollow()}
            />
          </div>

          {profileError && <p className="text-sm text-red-400">{profileError}</p>}

          <section>
            <h2 className="mb-4 text-lg font-medium">投稿视频</h2>
            {videosLoading ? (
              <p className="text-sm text-muted-foreground">加载投稿中...</p>
            ) : videosError && videos.length === 0 ? (
              <p className="text-sm text-red-400">{videosError}</p>
            ) : videos.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                  {videos.map((video) => (
                    <VideoCard key={video.bvid} video={video} />
                  ))}
                </div>
                <div ref={sentinelRef} className="py-6 text-center text-sm text-muted-foreground">
                  {loadingMore ? '加载更多...' : hasMore ? '继续下滑加载更多' : '已经到底啦'}
                </div>
                {videosError && <p className="text-sm text-red-400">{videosError}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">暂无投稿</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
