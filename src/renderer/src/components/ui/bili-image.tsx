import { type ImgHTMLAttributes } from 'react'
import { normalizeBiliImage } from '@/lib/bili-image'

interface BiliImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
}

export function BiliImage({ src, alt, className, ...props }: BiliImageProps) {
  const url = normalizeBiliImage(src)
  if (!url) {
    return <div className={className} aria-label={alt} />
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      {...props}
    />
  )
}
