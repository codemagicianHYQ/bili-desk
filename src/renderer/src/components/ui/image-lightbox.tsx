import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  images: string[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    if (open) setCurrent(index);
  }, [open, index]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        const next = (current - 1 + images.length) % images.length;
        setCurrent(next);
        onIndexChange?.(next);
        return;
      }
      if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        const next = (current + 1) % images.length;
        setCurrent(next);
        onIndexChange?.(next);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, current, images.length, onClose, onIndexChange]);

  if (!open || images.length === 0) return null;

  const src = images[current] ?? images[0];

  const go = (delta: number) => {
    if (images.length <= 1) return;
    const next = (current + delta + images.length) % images.length;
    setCurrent(next);
    onIndexChange?.(next);
  };

  return (
    <OverlayPortal>
      <div
        className={cn(
          "fixed inset-0 flex items-center justify-center bg-black/85 p-4",
          APP_OVERLAY_ZCLASS,
        )}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        {images.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                go(-1);
              }}
              aria-label="上一张"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                go(1);
              }}
              aria-label="下一张"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
              {current + 1} / {images.length}
            </p>
          </>
        )}

        <div
          className="max-h-[90vh] max-w-[92vw]"
          onClick={(event) => event.stopPropagation()}
        >
          <BiliImage
            src={src}
            alt="评论图片预览"
            loading="eager"
            className="max-h-[90vh] max-w-[92vw] object-contain"
          />
        </div>
      </div>
    </OverlayPortal>
  );
}
