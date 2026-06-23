import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import type { VideoItem } from '@shared/types'
import { cn, formatCount, formatDuration } from '@/lib/utils'
import { BiliImage } from '@/components/ui/bili-image'

interface VideoCardProps {
  video: VideoItem
  className?: string
}

export function VideoCard({ video, className }: VideoCardProps) {
  return (
    <Link
      to={`/video/${video.bvid}`}
      className={cn(
        'group block overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        className
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <BiliImage
          src={video.cover}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(video.duration)}
        </span>
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
          <Play className="h-10 w-10 fill-white text-white" />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{video.owner.name}</span>
          <span>{formatCount(video.play)} 播放</span>
        </div>
      </div>
    </Link>
  )
}
