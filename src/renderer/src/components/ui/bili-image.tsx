import { type ImgHTMLAttributes } from "react";
import { normalizeBiliImage, normalizeVideoCover } from "@/lib/bili-image";

interface BiliImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  variant?: "default" | "cover";
}

export function BiliImage({
  src,
  alt,
  className,
  variant = "default",
  ...props
}: BiliImageProps) {
  const url =
    variant === "cover" ? normalizeVideoCover(src) : normalizeBiliImage(src);
  if (!url) {
    return <div className={className} aria-label={alt} />;
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
  );
}
