import { useCallback, useEffect, useRef, useState } from 'react'
import type { FollowTag, FollowingUp, UpGroup } from '@shared/types'
import { UpGroupPanel } from '@/components/taxonomy/UpGroupPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Folder, Loader2, Sparkles } from 'lucide-react'
import { FollowTagDialog } from './FollowTagDialog'
import { FollowingUpCard } from './FollowingUpCard'

type SidebarMode = 'bilibili' | 'local'

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : '加载失败'
  if (message.includes('412') || message.includes('安全策略')) {
    return '请求被 B 站安全策略拦截，请稍后重试'
  }
  return message
}

export function FollowingPage() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadSeqRef = useRef(0)

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('bilibili')
  const [followTags, setFollowTags] = useState<FollowTag[]>([])
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [localGroups, setLocalGroups] = useState<UpGroup[]>([])
  const [selectedLocalGroupId, setSelectedLocalGroupId] = useState<number | null>(null)
  const [followings, setFollowings] = useState<FollowingUp[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const [allFollowingsCache, setAllFollowingsCache] = useState<FollowingUp[] | null>(null)
  const [tagDialogUp, setTagDialogUp] = useState<FollowingUp | null>(null)
  const [actionMessage, setActionMessage] = useState('')

  const isLocalMode = sidebarMode === 'local'
  const selectedTag = followTags.find((tag) => tag.tagId === selectedTagId)
  const selectedLocalGroup = localGroups.find((group) => group.id === selectedLocalGroupId)

  const refreshSidebar = useCallback(async () => {
    const [tags, groups] = await Promise.all([
      window.biliDesk.bili.getFollowTags(),
      window.biliDesk.taxonomy.getUpGroups()
    ])
    setFollowTags(tags)
    setLocalGroups(groups)
    setSelectedTagId((prev) => prev ?? tags[0]?.tagId ?? null)
    setSelectedLocalGroupId((prev) => prev ?? groups[0]?.id ?? null)
  }, [])

  const loadAllFollowings = useCallback(async (): Promise<FollowingUp[]> => {
    if (allFollowingsCache) return allFollowingsCache

    const all: FollowingUp[] = []
    let currentPage = 1

    while (true) {
      const batch = await window.biliDesk.bili.getFollowings(currentPage)
      if (batch.length === 0) break
      all.push(...batch)
      if (batch.length < 50) break
      currentPage++
    }

    setAllFollowingsCache(all)
    return all
  }, [allFollowingsCache])

  const loadBilibiliPage = useCallback(async (tagId: number, nextPage: number, append: boolean) => {
    const seq = ++loadSeqRef.current

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError('')
      setFollowings([])
      setPage(1)
      setHasMore(false)
    }

    try {
      const result = await window.biliDesk.bili.getFollowingsInTag(tagId, nextPage)
      if (seq !== loadSeqRef.current) return

      setFollowings((prev) => (append ? [...prev, ...result.followings] : result.followings))
      setPage(result.page)
      setHasMore(result.hasMore)
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      if (!append) setFollowings([])
      setError(formatError(err))
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  const loadLocalGroupMembers = useCallback(
    async (groupId: number) => {
      const seq = ++loadSeqRef.current
      setLoading(true)
      setError('')
      setFollowings([])
      setHasMore(false)

      try {
        const [mids, all] = await Promise.all([
          window.biliDesk.taxonomy.getUpGroupMemberMids(groupId),
          loadAllFollowings()
        ])
        if (seq !== loadSeqRef.current) return

        const midSet = new Set(mids)
        setFollowings(all.filter((up) => midSet.has(up.mid)))
      } catch (err) {
        if (seq !== loadSeqRef.current) return
        setFollowings([])
        setError(formatError(err))
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [loadAllFollowings]
  )

  useEffect(() => {
    void refreshSidebar()
  }, [refreshSidebar])

  useEffect(() => {
    if (sidebarMode !== 'bilibili' || selectedTagId == null) return
    void loadBilibiliPage(selectedTagId, 1, false)
  }, [sidebarMode, selectedTagId, loadBilibiliPage])

  useEffect(() => {
    if (sidebarMode !== 'local' || selectedLocalGroupId == null) return
    void loadLocalGroupMembers(selectedLocalGroupId)
  }, [sidebarMode, selectedLocalGroupId, loadLocalGroupMembers])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [sidebarMode, selectedTagId, selectedLocalGroupId])

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const handleSelectTag = (tagId: number) => {
    setError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    if (tagId === selectedTagId) {
      void loadBilibiliPage(tagId, 1, false)
      return
    }
    setSelectedTagId(tagId)
  }

  const handleSelectLocalGroup = (groupId: number) => {
    setError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setSelectedLocalGroupId(groupId)
  }

  const loadMoreBilibili = useCallback(async () => {
    if (selectedTagId == null || !hasMore || loadingMore || loading || isLocalMode) return
    await loadBilibiliPage(selectedTagId, page + 1, true)
  }, [selectedTagId, hasMore, loadingMore, loading, isLocalMode, loadBilibiliPage, page])

  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !hasMore || isLocalMode) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        void loadMoreBilibili()
      },
      { root, rootMargin: '200px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isLocalMode, loadMoreBilibili, followings.length])

  const runAiClassify = async () => {
    setTaskMessage('正在启动 AI 分类...')
    const { taskId } = await window.biliDesk.ai.runUpClassification()

    const poll = setInterval(async () => {
      const task = await window.biliDesk.ai.getTaskStatus(taskId)
      if (!task) return
      setTaskMessage(task.message)
      if (task.status === 'done' || task.status === 'failed') {
        clearInterval(poll)
        setAllFollowingsCache(null)
        await refreshSidebar()
        if (selectedLocalGroupId != null) {
          void loadLocalGroupMembers(selectedLocalGroupId)
        }
      }
    }, 1000)
  }

  const reloadCurrentList = useCallback(async () => {
    if (sidebarMode === 'bilibili' && selectedTagId != null) {
      await loadBilibiliPage(selectedTagId, 1, false)
      return
    }
    if (sidebarMode === 'local' && selectedLocalGroupId != null) {
      await loadLocalGroupMembers(selectedLocalGroupId)
    }
  }, [sidebarMode, selectedTagId, selectedLocalGroupId, loadBilibiliPage, loadLocalGroupMembers])

  const handleUnfollow = async (up: FollowingUp) => {
    if (!window.confirm(`确定取消关注「${up.uname}」吗？`)) return

    setActionMessage('')
    try {
      await window.biliDesk.bili.modifyFollow(up.mid, false)
      setFollowings((prev) => prev.filter((item) => item.mid !== up.mid))
      setAllFollowingsCache(null)
      await refreshSidebar()
      setActionMessage(`已取消关注「${up.uname}」`)
    } catch (err) {
      setActionMessage(formatError(err))
    }
  }

  const handleTagSaved = async () => {
    setAllFollowingsCache(null)
    await refreshSidebar()
    await reloadCurrentList()
    setActionMessage('分组已更新')
  }

  return (
    <div className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-3">
          <p className="text-sm font-medium">关注</p>
          <div className="flex rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => handleSidebarModeChange('bilibili')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                sidebarMode === 'bilibili'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              B 站分组
            </button>
            <button
              type="button"
              onClick={() => handleSidebarModeChange('local')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                sidebarMode === 'local'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              本地分组
            </button>
          </div>
        </div>

        {isLocalMode && (
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">AI 与规则智能分组</p>
              <Button variant="ghost" size="icon" onClick={() => void runAiClassify()} title="AI 自动分类">
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
            {taskMessage && <p className="text-xs text-muted-foreground">{taskMessage}</p>}
          </div>
        )}

        <div className="scrollbar-none flex-1 overflow-y-auto p-2">
          {sidebarMode === 'bilibili' ? (
            <div className="space-y-0.5">
              {followTags.map((tag) => (
                <button
                  key={tag.tagId}
                  type="button"
                  onClick={() => handleSelectTag(tag.tagId)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    selectedTagId === tag.tagId
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-secondary'
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{tag.count}</span>
                </button>
              ))}
              {followTags.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">登录后可同步 B 站关注分组</p>
              )}
            </div>
          ) : (
            <UpGroupPanel
              groups={localGroups}
              selectedId={selectedLocalGroupId}
              onSelect={handleSelectLocalGroup}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          {isLocalMode ? (
            <>
              本地分组「{selectedLocalGroup?.name ?? '...'}」：共 {followings.length} 个 UP
            </>
          ) : (
            <>
              B 站分组「{selectedTag?.name ?? '...'}」：已加载 {followings.length}
              {selectedTag ? ` / ${selectedTag.count}` : ''} 个 UP
            </>
          )}
          {actionMessage && <span className="ml-2 text-foreground">{actionMessage}</span>}
        </div>

        <div ref={scrollRef} className="scrollbar-none flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载关注列表...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
              {followings.map((up) => (
                <FollowingUpCard
                  key={up.mid}
                  up={up}
                  showGroupActions={!isLocalMode}
                  onSetGroup={setTagDialogUp}
                  onUnfollow={(item) => void handleUnfollow(item)}
                />
              ))}

              {!loading && followings.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  {isLocalMode
                    ? '该本地分组暂无成员，可点击上方 ✨ 运行 AI 分类'
                    : error || '该分组暂无关注的 UP'}
                </p>
              )}
            </div>
          )}

          {!isLocalMode && (hasMore || loadingMore) && followings.length > 0 && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载更多...
                </>
              ) : (
                '继续下滑加载更多'
              )}
            </div>
          )}
        </div>
      </div>

      <FollowTagDialog
        up={tagDialogUp}
        tags={followTags}
        onClose={() => setTagDialogUp(null)}
        onSaved={() => void handleTagSaved()}
      />
    </div>
  )
}
