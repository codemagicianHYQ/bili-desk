import { useEffect, useRef, useState } from 'react'
import type { FollowingUp } from '@shared/types'
import { BiliImage } from '@/components/ui/bili-image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FolderCog, List, UserMinus } from 'lucide-react'
import { Link } from 'react-router-dom'

interface FollowingUpCardProps {
  up: FollowingUp
  showGroupActions?: boolean
  onSetGroup: (up: FollowingUp) => void
  onUnfollow: (up: FollowingUp) => void
}

export function FollowingUpCard({ up, showGroupActions = true, onSetGroup, onUnfollow }: FollowingUpCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <Link to={`/up/${up.mid}`} className="shrink-0">
        <BiliImage src={up.face} alt="" className="h-12 w-12 rounded-full object-cover" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/up/${up.mid}`} className="truncate font-medium hover:text-primary">
            {up.uname}
          </Link>
          {up.special && <Badge variant="secondary">特别关注</Badge>}
          {up.mutual && <Badge variant="secondary">互相关注</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{up.sign || '暂无签名'}</p>
      </div>

      <div ref={menuRef} className="relative shrink-0">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn(
            'gap-1 border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80',
            menuOpen && 'bg-muted/80'
          )}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <List className="h-3.5 w-3.5" />
          已关注
        </Button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {showGroupActions && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary"
                onClick={() => {
                  setMenuOpen(false)
                  onSetGroup(up)
                }}
              >
                <FolderCog className="h-4 w-4 text-muted-foreground" />
                设置分组
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-secondary"
              onClick={() => {
                setMenuOpen(false)
                onUnfollow(up)
              }}
            >
              <UserMinus className="h-4 w-4" />
              取消关注
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
