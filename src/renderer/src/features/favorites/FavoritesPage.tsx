import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FavResource, LocalCategorySelection } from '@shared/types'
import { useFavoritesStore } from '@/stores/favorites-store'
import {
  assignmentToFavResource,
  enrichTreeWithCounts,
  filterAssignmentsByCategory
} from '@shared/utils/local-category'
import { CategoryTree } from '@/components/taxonomy/CategoryTree'
import { BiliImage } from '@/components/ui/bili-image'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { cn, formatDuration } from '@/lib/utils'
import { Folder, Loader2, Sparkles } from 'lucide-react'

const LOCAL_PAGE_SIZE = 40

type SidebarMode = 'bilibili' | 'local'

function formatFolderError(err: unknown): string {
  const message = err instanceof Error ? err.message : '加载失败'
  if (message.includes('412') || message.includes('安全策略')) {
    return '请求被 B 站安全策略拦截，请稍后重试'
  }
  if (message.startsWith('Error invoking remote method')) {
    return '加载失败，请稍后重试'
  }
  return message
}

function FavVideoCard({ item }: { item: FavResource }) {
  return (
    <Link
      to={item.bvid ? `/video/${item.bvid}` : '#'}
      className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
    >
      {item.cover ? (
        <BiliImage src={item.cover} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          无封面
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        {item.upper.name && <p className="mt-1 text-xs text-muted-foreground">{item.upper.name}</p>}
        {item.duration > 0 && (
          <p className="text-xs text-muted-foreground">{formatDuration(item.duration)}</p>
        )}
      </div>
    </Link>
  )
}

export function FavoritesPage() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const folderLoadSeqRef = useRef(0)

  const tree = useFavoritesStore((state) => state.tree)
  const assignments = useFavoritesStore((state) => state.assignments)
  const folders = useFavoritesStore((state) => state.folders)
  const ensureTaxonomy = useFavoritesStore((state) => state.ensureTaxonomy)
  const ensureFolders = useFavoritesStore((state) => state.ensureFolders)
  const enrichCoversOnce = useFavoritesStore((state) => state.enrichCoversOnce)
  const invalidateTaxonomy = useFavoritesStore((state) => state.invalidateTaxonomy)

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('bilibili')
  const [resources, setResources] = useState<FavResource[]>([])
  const [folderPage, setFolderPage] = useState(1)
  const [folderHasMore, setFolderHasMore] = useState(false)
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderLoadingMore, setFolderLoadingMore] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<LocalCategorySelection>({ level: 'all', id: null })
  const [localVisibleCount, setLocalVisibleCount] = useState(LOCAL_PAGE_SIZE)
  const [classifying, setClassifying] = useState(false)
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null)
  const [classifyProgress, setClassifyProgress] = useState(0)

  const isLocalMode = sidebarMode === 'local'

  const reloadTaxonomy = useCallback(async () => {
    await ensureTaxonomy({ force: true })
  }, [ensureTaxonomy])

  useEffect(() => {
    void (async () => {
      await ensureTaxonomy()
      void enrichCoversOnce()
      const list = await ensureFolders()
      setSelectedFolder((prev) => prev ?? list[0]?.id ?? null)
    })()
  }, [ensureTaxonomy, ensureFolders, enrichCoversOnce])

  const loadFolderPage = useCallback(async (mediaId: number, page: number, append: boolean) => {
    const seq = ++folderLoadSeqRef.current

    if (append) {
      setFolderLoadingMore(true)
    } else {
      setFolderLoading(true)
      setFolderError('')
      setResources([])
      setFolderPage(1)
      setFolderHasMore(false)
    }

    try {
      const result = await window.biliDesk.bili.getFavResources(mediaId, page)
      if (seq !== folderLoadSeqRef.current) return

      setResources((prev) => (append ? [...prev, ...result.resources] : result.resources))
      setFolderPage(result.page)
      setFolderHasMore(result.hasMore)
    } catch (err) {
      if (seq !== folderLoadSeqRef.current) return
      if (!append) setResources([])
      setFolderError(formatFolderError(err))
    } finally {
      if (seq === folderLoadSeqRef.current) {
        setFolderLoading(false)
        setFolderLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    if (sidebarMode !== 'bilibili' || !selectedFolder) return
    void loadFolderPage(selectedFolder, 1, false)
  }, [selectedFolder, sidebarMode, loadFolderPage])

  useEffect(() => {
    setLocalVisibleCount(LOCAL_PAGE_SIZE)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [localSelection, sidebarMode])

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const handleSelectFolder = (folderId: number) => {
    setFolderError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0

    if (folderId === selectedFolder) {
      void loadFolderPage(folderId, 1, false)
      return
    }

    setSelectedFolder(folderId)
  }

  const treeWithCounts = useMemo(() => enrichTreeWithCounts(tree, assignments), [tree, assignments])

  const localCategoryItems = useMemo(() => {
    if (!isLocalMode) return []
    return filterAssignmentsByCategory(assignments, localSelection, tree).map(assignmentToFavResource)
  }, [assignments, isLocalMode, localSelection, tree])

  const displayItems = isLocalMode ? localCategoryItems.slice(0, localVisibleCount) : resources

  const loadMoreFolder = useCallback(async () => {
    if (!selectedFolder || !folderHasMore || folderLoadingMore || folderLoading || isLocalMode) return
    await loadFolderPage(selectedFolder, folderPage + 1, true)
  }, [
    selectedFolder,
    folderHasMore,
    folderLoadingMore,
    folderLoading,
    isLocalMode,
    loadFolderPage,
    folderPage
  ])

  const loadMoreLocal = useCallback(() => {
    if (localVisibleCount >= localCategoryItems.length) return
    setLocalVisibleCount((prev) => Math.min(prev + LOCAL_PAGE_SIZE, localCategoryItems.length))
  }, [localVisibleCount, localCategoryItems.length])

  const hasMore = isLocalMode ? localVisibleCount < localCategoryItems.length : folderHasMore
  const loadingMore = isLocalMode ? false : folderLoadingMore

  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (isLocalMode) loadMoreLocal()
        else void loadMoreFolder()
      },
      { root, rootMargin: '200px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isLocalMode, loadMoreFolder, loadMoreLocal, displayItems.length])

  const handleClassifyAll = async () => {
    setClassifying(true)
    setClassifyMessage('正在启动分类任务...')
    setClassifyProgress(0)

    try {
      const { taskId } = await window.biliDesk.taxonomy.classifyAllFavorites()

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const task = await window.biliDesk.taxonomy.getFavTaskStatus(taskId)
            if (!task) return

            setClassifyMessage(task.message)
            setClassifyProgress(task.progress)

            if (task.status === 'done' || task.status === 'failed') {
              clearInterval(poll)
              invalidateTaxonomy()
              await reloadTaxonomy()
              void enrichCoversOnce()
              if (task.status === 'failed') {
                reject(new Error(task.message))
              } else {
                resolve()
              }
            }
          } catch (err) {
            clearInterval(poll)
            reject(err)
          }
        }, 500)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '分类失败，请确认已登录'
      setClassifyMessage(
        message.includes('412') || message.includes('安全策略')
          ? '请求被 B 站安全策略拦截，请等待几秒后重试'
          : message
      )
    } finally {
      setClassifying(false)
    }
  }

  const handleRename = async (level: 'l1' | 'l2' | 'l3', id: number, currentName: string) => {
    const next = window.prompt('编辑分类名称', currentName)
    if (!next || next.trim() === currentName) return
    await window.biliDesk.taxonomy.updateCategoryName(level, id, next.trim())
    await reloadTaxonomy()
  }

  const selectedFolderInfo = folders.find((f) => f.id === selectedFolder)

  return (
    <div className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-3">
          <p className="text-sm font-medium">收藏夹</p>
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
              B 站收藏夹
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
              本地分类
            </button>
          </div>
        </div>

        {isLocalMode && (
          <div className="space-y-2 border-b border-border p-3">
            <p className="text-xs text-muted-foreground">按标题智能归类，全量分类会重建本地目录</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full gap-1.5"
              disabled={classifying}
              onClick={() => void handleClassifyAll()}
            >
              {classifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              智能分类全部收藏
            </Button>
            {classifyMessage && <p className="text-xs text-muted-foreground">{classifyMessage}</p>}
            {classifying && classifyProgress > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${classifyProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="scrollbar-none flex-1 overflow-y-auto p-2">
          {sidebarMode === 'bilibili' ? (
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleSelectFolder(folder.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    selectedFolder === folder.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-secondary'
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{folder.mediaCount}</span>
                </button>
              ))}
              {folders.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">登录后可同步 B 站收藏夹</p>
              )}
            </div>
          ) : (
            <CategoryTree
              tree={treeWithCounts}
              selection={localSelection}
              onSelect={setLocalSelection}
              onRename={(level, id, name) => void handleRename(level, id, name)}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          {isLocalMode ? (
            <>
              本地分类
              {localSelection.level !== 'all' && ' · 已筛选'}
              ：共 {localCategoryItems.length} 个视频
              {localCategoryItems.length > 0 && `，已显示 ${displayItems.length} 个`}
            </>
          ) : (
            <>
              B 站收藏夹「{selectedFolderInfo?.title ?? '...'}」：已加载 {resources.length}
              {selectedFolderInfo ? ` / ${selectedFolderInfo.mediaCount}` : ''} 个视频
            </>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {folderLoading && !isLocalMode ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载收藏中...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-3">
              {displayItems.map((item) => (
                <FavVideoCard key={`${item.id}-${item.bvid}`} item={item} />
              ))}

              {!folderLoading && displayItems.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  {isLocalMode
                    ? assignments.length === 0
                      ? '暂无本地分类数据，请先点击「智能分类全部收藏」'
                      : '该分类下暂无视频'
                    : folderError || '该收藏夹暂无视频'}
                </p>
              )}
            </div>
          )}

          {(hasMore || loadingMore) && displayItems.length > 0 && (
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
    </div>
  )
}
