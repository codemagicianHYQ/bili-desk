import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FollowingUp, UpGroupSelection, UpGroupTreeNode } from '@shared/types'
import { useFollowingStore } from '@/stores/following-store'
import { UpGroupTree } from '@/components/taxonomy/UpGroupTree'
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

function getLocalSelectionLabel(tree: UpGroupTreeNode[], selection: UpGroupSelection): string {
  if (selection.level === 'uncategorized') return '未分组'
  if (selection.level === 'l1' && selection.id != null) {
    return tree.find((node) => node.id === selection.id)?.name ?? '...'
  }
  if (selection.level === 'l2' && selection.id != null) {
    for (const l1 of tree) {
      const l2 = l1.children.find((child) => child.id === selection.id)
      if (l2) return `${l1.name} / ${l2.name}`
    }
  }
  return '...'
}

export function FollowingPage() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadSeqRef = useRef(0)

  const followTags = useFollowingStore((state) => state.followTags)
  const upGroupTree = useFollowingStore((state) => state.upGroupTree)
  const uncategorizedCount = useFollowingStore((state) => state.uncategorizedCount)
  const allFollowings = useFollowingStore((state) => state.allFollowings)
  const refreshSidebar = useFollowingStore((state) => state.refreshSidebar)
  const filterLocalFollowings = useFollowingStore((state) => state.filterLocalFollowings)
  const invalidateFollowings = useFollowingStore((state) => state.invalidateFollowings)
  const invalidateSidebar = useFollowingStore((state) => state.invalidateSidebar)
  const patchFollowing = useFollowingStore((state) => state.patchFollowing)

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('bilibili')
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<UpGroupSelection>({ level: 'l1', id: null })
  const [followings, setFollowings] = useState<FollowingUp[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const [tagDialogUp, setTagDialogUp] = useState<FollowingUp | null>(null)
  const [actionMessage, setActionMessage] = useState('')

  const isLocalMode = sidebarMode === 'local'
  const selectedTag = followTags.find((tag) => tag.tagId === selectedTagId)
  const localSelectionLabel = useMemo(
    () => getLocalSelectionLabel(upGroupTree, localSelection),
    [upGroupTree, localSelection]
  )

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
    async (selection: UpGroupSelection) => {
      if (selection.level !== 'uncategorized' && selection.id == null) return

      const seq = ++loadSeqRef.current
      const hasCachedFollowings = useFollowingStore.getState().allFollowings != null

      if (!hasCachedFollowings) {
        setLoading(true)
        setError('')
        setFollowings([])
      }
      setHasMore(false)

      try {
        const result = await filterLocalFollowings(selection)
        if (seq !== loadSeqRef.current) return
        setFollowings(result)
      } catch (err) {
        if (seq !== loadSeqRef.current) return
        setFollowings([])
        setError(formatError(err))
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [filterLocalFollowings]
  )

  useEffect(() => {
    void (async () => {
      await refreshSidebar()
      const { followTags: tags, upGroupTree: tree } = useFollowingStore.getState()
      setSelectedTagId((prev) => prev ?? tags[0]?.tagId ?? null)
      setLocalSelection((prev) => {
        if (prev.id != null) return prev
        return { level: 'l1', id: tree[0]?.id ?? null }
      })
    })()
  }, [refreshSidebar])

  useEffect(() => {
    if (sidebarMode !== 'bilibili' || selectedTagId == null) return
    void loadBilibiliPage(selectedTagId, 1, false)
  }, [sidebarMode, selectedTagId, loadBilibiliPage])

  useEffect(() => {
    if (sidebarMode !== 'local') return
    if (localSelection.level !== 'uncategorized' && localSelection.id == null) return
    void loadLocalGroupMembers(localSelection)
  }, [sidebarMode, localSelection, loadLocalGroupMembers])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [sidebarMode, selectedTagId, localSelection])

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

  const handleSelectLocalGroup = (selection: UpGroupSelection) => {
    setError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setLocalSelection(selection)
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
    setTaskMessage('正在启动智能分组...')
    const { taskId } = await window.biliDesk.ai.runUpClassification()

    const poll = setInterval(async () => {
      const task = await window.biliDesk.ai.getTaskStatus(taskId)
      if (!task) return
      setTaskMessage(task.message)
      if (task.status === 'done' || task.status === 'failed') {
        clearInterval(poll)
        invalidateSidebar()
        await refreshSidebar({ force: true })
        void loadLocalGroupMembers(localSelection)
      }
    }, 1000)
  }

  const reloadCurrentList = useCallback(async () => {
    if (sidebarMode === 'bilibili' && selectedTagId != null) {
      await loadBilibiliPage(selectedTagId, 1, false)
      return
    }
    if (sidebarMode === 'local') {
      await loadLocalGroupMembers(localSelection)
    }
  }, [sidebarMode, selectedTagId, localSelection, loadBilibiliPage, loadLocalGroupMembers])

  const handleUnfollow = async (up: FollowingUp) => {
    if (!window.confirm(`确定取消关注「${up.uname}」吗？`)) return

    setActionMessage('')
    try {
      await window.biliDesk.bili.modifyFollow(up.mid, false)
      setFollowings((prev) => prev.filter((item) => item.mid !== up.mid))
      patchFollowing(up.mid, null)
      invalidateSidebar()
      await refreshSidebar({ force: true })
      setActionMessage(`已取消关注「${up.uname}」`)
    } catch (err) {
      setActionMessage(formatError(err))
    }
  }

  const handleTagSaved = async () => {
    invalidateFollowings()
    invalidateSidebar()
    await refreshSidebar({ force: true })
    await reloadCurrentList()
    setActionMessage('分组已更新')
  }

  const showInitialLocalLoading = loading && followings.length === 0 && !allFollowings

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
              <Button variant="ghost" size="icon" onClick={() => void runAiClassify()} title="运行智能分组">
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
            <UpGroupTree
              tree={upGroupTree}
              selection={localSelection}
              uncategorizedCount={uncategorizedCount}
              onSelect={handleSelectLocalGroup}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          {isLocalMode ? (
            <>
              本地分组「{localSelectionLabel}」：共 {followings.length} 个 UP
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
          {showInitialLocalLoading || (loading && !isLocalMode) ? (
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
                    ? '该本地分组暂无成员，可点击上方 ✨ 运行智能分组'
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
