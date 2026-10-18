import { useLayoutEffect, useRef, useState } from "react";
import { EyeOff, MoreVertical, UserX } from "lucide-react";
import type { RecommendDislikeReason, VideoItem } from "@shared/types";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";

export function RecommendDislikeMenu({
  video,
  onDislike,
}: {
  video: VideoItem;
  onDislike: (reason: RecommendDislikeReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 8 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = panelRef.current?.offsetHeight ?? 88;
      const gap = 6;
      let top = anchor.bottom + gap;
      if (
        top + height > window.innerHeight - 8 &&
        anchor.top - gap - height > 8
      ) {
        top = anchor.top - gap - height;
      }
      setPos({ top, right: Math.max(8, window.innerWidth - anchor.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const pick = (reason: RecommendDislikeReason) => {
    setOpen(false);
    onDislike(reason);
  };

  const row =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#e3e5e7] transition-colors hover:bg-white/5";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="推荐反馈"
        className={cn(
          "shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <OverlayPortal>
          {/* portal 里的点击仍会沿 React 树冒泡到卡片 Link */}
          <div
            className="contents"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <button
              type="button"
              aria-label="关闭推荐反馈"
              className={cn(
                "fixed inset-0 cursor-default border-0 bg-transparent p-0",
                APP_OVERLAY_ZCLASS,
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                setOpen(false);
              }}
            />
            <div
              ref={panelRef}
              role="menu"
              className={cn(
                "fixed w-48 overflow-hidden rounded-xl bg-[#2b2d31] py-1 shadow-2xl ring-1 ring-white/10",
                APP_OVERLAY_ZCLASS,
              )}
              style={{ top: pos.top, right: pos.right }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button type="button" className={row} onClick={() => pick(1)}>
                <EyeOff className="h-4 w-4 text-[#fb7299]" />
                不感兴趣
              </button>
              {video.owner.mid > 0 && (
                <button type="button" className={row} onClick={() => pick(4)}>
                  <UserX className="h-4 w-4 text-[#fb7299]" />
                  <span className="min-w-0 truncate">
                    不想看 UP：{video.owner.name}
                  </span>
                </button>
              )}
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
