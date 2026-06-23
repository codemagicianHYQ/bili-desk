import { useEffect, useRef } from 'react'
import Artplayer from 'artplayer'
import flvjs from 'flv.js'
import type { VideoPlayInfo } from '@shared/types'

interface VideoPlayerProps {
  playInfo: VideoPlayInfo
  poster?: string
  onQualityChange: (qn: number) => void
  onError?: (message: string) => void
}

export function VideoPlayer({ playInfo, poster, onQualityChange, onError }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onQualityChangeRef = useRef(onQualityChange)
  const onErrorRef = useRef(onError)

  onQualityChangeRef.current = onQualityChange
  onErrorRef.current = onError

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const art = new Artplayer({
      container,
      url: playInfo.url,
      poster,
      autoplay: true,
      autoSize: false,
      autoMini: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: true,
      mutex: true,
      theme: '#fb7299',
      lang: 'zh-cn',
      type: playInfo.format === 'flv' ? 'flv' : 'mp4',
      customType: {
        flv(video, url, player) {
          if (!flvjs.isSupported()) {
            onErrorRef.current?.('当前环境不支持 FLV 播放')
            return
          }

          const flvPlayer = flvjs.createPlayer({ type: 'flv', url, isLive: false })
          flvPlayer.attachMediaElement(video)
          flvPlayer.load()
          player.on('destroy', () => flvPlayer.destroy())
        }
      },
      settings: [
        {
          html: '清晰度',
          selector: playInfo.qualities.map((item) => ({
            html: item.label,
            default: item.qn === playInfo.quality,
            qn: item.qn
          })),
          onSelect(item) {
            const qn = item.qn as number
            if (qn !== playInfo.quality) {
              onQualityChangeRef.current(qn)
            }
            return item.html
          }
        }
      ]
    })

    art.on('video:error', () => {
      onErrorRef.current?.('视频加载失败，请切换清晰度或稍后重试')
    })

    return () => {
      art.destroy()
    }
  }, [playInfo.url, playInfo.format, playInfo.quality, playInfo.qualities, poster])

  return <div ref={containerRef} className="aspect-video w-full bg-black" />
}
