import { useEffect, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!loading) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">{children}</div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1 px-5 pb-1 pt-3">
          <h2 id="confirm-dialog-title" className="text-base font-semibold">
            {title}
          </h2>
          {description && (
            <p id="confirm-dialog-description" className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="flex gap-2 p-4 pt-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn(
              'flex-1',
              destructive && 'border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25'
            )}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
