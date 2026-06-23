import { useEffect, useState } from 'react'
import type { FollowTag, FollowingUp } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowTagDialogProps {
  up: FollowingUp | null
  tags: FollowTag[]
  onClose: () => void
  onSaved: () => void
}

export function FollowTagDialog({ up, tags, onClose, onSaved }: FollowTagDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!up) return

    setError('')
    setLoading(true)
    void window.biliDesk.bili
      .getUserFollowTags(up.mid)
      .then((tagIds) => {
        const next = new Set(tagIds)
        if (next.size === 0) next.add(0)
        setSelected(next)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载分组失败')
      })
      .finally(() => setLoading(false))
  }, [up])

  if (!up) return null

  const toggleTag = (tagId: number) => {
    if (tagId === 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      if (!next.has(0)) next.add(0)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await window.biliDesk.bili.setUserFollowTags(up.mid, [...selected])
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存分组失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">设置分组</p>
            <p className="text-xs text-muted-foreground">{up.uname}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载分组...
            </div>
          ) : (
            <div className="space-y-1">
              {tags.map((tag) => {
                const checked = selected.has(tag.tagId)
                const disabled = tag.tagId === 0
                return (
                  <label
                    key={tag.tagId}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary',
                      disabled && 'cursor-default opacity-80'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleTag(tag.tagId)}
                    />
                    <span className="flex-1 text-sm">{tag.name}</span>
                    <span className="text-xs text-muted-foreground">{tag.count}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 border-t border-border p-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="button" className="flex-1" disabled={loading || saving} onClick={() => void handleSave()}>
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
  )
}
