import type { FollowingUp } from '@shared/types'
import { BiliImage } from '@/components/ui/bili-image'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { UserMinus } from 'lucide-react'

interface UnfollowConfirmDialogProps {
  up: FollowingUp | null
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function UnfollowConfirmDialog({ up, loading, onConfirm, onCancel }: UnfollowConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={up != null}
      title="取消关注"
      description={up ? `确定取消关注「${up.uname}」吗？之后可在 UP 主页面重新关注。` : undefined}
      confirmLabel="取消关注"
      cancelLabel="保留关注"
      destructive
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {up && (
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <BiliImage src={up.face} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-border" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-red-400">
              <UserMinus className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{up.uname}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{up.sign || '暂无签名'}</p>
          </div>
        </div>
      )}
    </ConfirmDialog>
  )
}
