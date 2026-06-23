import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FollowButtonProps {
  isFollowing: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  size?: 'default' | 'sm'
  className?: string
}

export function FollowButton({
  isFollowing,
  loading = false,
  disabled = false,
  onClick,
  size = 'sm',
  className
}: FollowButtonProps) {
  return (
    <Button
      size={size}
      variant={isFollowing ? 'secondary' : 'default'}
      className={cn(
        isFollowing &&
          'border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80',
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? '处理中...' : isFollowing ? '已关注' : '+ 关注'}
    </Button>
  )
}
