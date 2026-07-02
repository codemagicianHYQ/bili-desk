import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { VideoFavFolder } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Bookmark, Folder, Loader2, X } from 'lucide-react'
import { useFavoritesStore } from '@/stores/favorites-store'

interface VideoFavButtonProps {
  aid: number
  className?: string
}

function formatFavError(err: unknown): string {
  const message = err instanceof Error ? err.message : '操作失败'
  if (message.includes('412') || message.includes('安全策略')) {
    return '请求被 B 站安全策略拦截，请稍后重试'
  }
  return message
}

export function VideoFavButton({ aid, className }: VideoFavButtonProps) {
  const invalidateFolders = useFavoritesStore((state) => state.invalidateFolders)

  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<VideoFavFolder[]>([])
  const [initialSelected, setInitialSelected] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isCollected = useMemo(() => folders.some((folder) => folder.collected), [folders])

  const loadFolders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await window.biliDesk.bili.getVideoFavFolders(aid)
      setFolders(list)
      const collectedIds = new Set(list.filter((folder) => folder.collected).map((folder) => folder.id))
      setInitialSelected(collectedIds)
      setSelected(new Set(collectedIds))
    } catch (err) {
      setError(formatFavError(err))
      setFolders([])
      setInitialSelected(new Set())
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }, [aid])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, saving])

  const toggleFolder = (folderId: number) => {
    setError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const handleSave = async () => {
    const addMediaIds = [...selected].filter((id) => !initialSelected.has(id))
    const delMediaIds = [...initialSelected].filter((id) => !selected.has(id))

    if (addMediaIds.length === 0 && delMediaIds.length === 0) {
      setOpen(false)
      return
    }

    if (selected.size === 0 && initialSelected.size === 0) {
      setError('请至少选择一个收藏夹')
      return
    }

    setSaving(true)
    setError('')
    try {
      await window.biliDesk.bili.setVideoFavFolders(aid, addMediaIds, delMediaIds)
      invalidateFolders()
      setOpen(false)
      await loadFolders()
    } catch (err) {
      setError(formatFavError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleOpen = () => {
    setError('')
    setOpen(true)
    void loadFolders()
  }

  const dialog = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!saving) setOpen(false)
      }}
    >
      <div
        className="relative z-[10000] w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">添加到收藏夹</p>
            <p className="text-xs text-muted-foreground">选择要收录此视频的 B 站收藏夹</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载收藏夹...
            </div>
          ) : folders.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {error || '暂无收藏夹，请先在 B 站创建收藏夹'}
            </p>
          ) : (
            <div className="space-y-1">
              {folders.map((folder) => {
                const checked = selected.has(folder.id)
                return (
                  <label
                    key={folder.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggleFolder(folder.id)}
                    />
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{folder.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{folder.mediaCount}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {error && folders.length > 0 && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 border-t border-border p-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={loading || saving || folders.length === 0}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '确定'
            )}
          </Button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={isCollected ? 'secondary' : 'outline'}
        className={cn(
          'gap-1.5',
          isCollected &&
            'border border-border bg-muted text-foreground shadow-none hover:bg-muted/80',
          className
        )}
        onClick={handleOpen}
      >
        <Bookmark className={cn('h-4 w-4', isCollected && 'fill-current text-primary')} />
        {isCollected ? '已收藏' : '收藏'}
      </Button>

      {dialog && createPortal(dialog, document.body)}
    </>
  )
}
