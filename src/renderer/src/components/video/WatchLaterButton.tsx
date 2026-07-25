import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { VideoItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatWatchLaterError } from "@/lib/watch-later-error";
import { useAppStore } from "@/stores/app-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { Clock, ListVideo, Loader2 } from "lucide-react";

interface WatchLaterButtonProps {
  aid: number;
  bvid: string;
  video?: VideoItem;
  variant?: "overlay" | "inline";
  className?: string;
}

export function WatchLaterButton({
  aid,
  bvid,
  video,
  variant = "overlay",
  className,
}: WatchLaterButtonProps) {
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const ensureLoaded = useWatchLaterStore((state) => state.ensureLoaded);
  const toggle = useWatchLaterStore((state) => state.toggle);
  const inList = useWatchLaterStore((state) => state.bvids.has(bvid));
  const [pending, setPending] = useState(false);
  const [tip, setTip] = useState("");
  const [tipIsError, setTipIsError] = useState(false);

  useEffect(() => {
    if (user?.isLogin) void ensureLoaded();
  }, [user?.isLogin, ensureLoaded]);

  const showTip = (message: string, isError = false) => {
    setTipIsError(isError);
    setTip(message);
    window.setTimeout(
      () => {
        setTip("");
        setTipIsError(false);
      },
      isError ? 2800 : 1800,
    );
  };

  const stopCardNavigation = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = async (event: React.MouseEvent) => {
    stopCardNavigation(event);

    if (!user?.isLogin) {
      navigate("/login");
      return;
    }

    const wasInList = inList;
    setPending(true);
    setTip("");
    setTipIsError(false);
    try {
      await toggle(aid, bvid, video);
      showTip(wasInList ? "已从稍后再看移除" : "已添加到稍后再看");
    } catch (err) {
      showTip(formatWatchLaterError(err), true);
    } finally {
      setPending(false);
    }
  };

  // 主页卡片有 overflow/transform，本地 tip 会被裁切；错误与成功都走全局 toast
  const toast =
    tip &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className={cn(
          "pointer-events-none fixed left-1/2 top-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-2xl",
          tipIsError
            ? "border border-primary/40 bg-black/90 text-primary"
            : "border border-border/40 bg-black/85 text-white",
        )}
      >
        {tip}
      </div>,
      document.body,
    );

  if (variant === "inline") {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "gap-1.5",
            inList ? "bili-action-btn-active" : "bili-action-btn",
            className,
          )}
          disabled={pending}
          onClick={(event) => void handleClick(event)}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : inList ? (
            <Clock className="h-4 w-4 fill-current" />
          ) : (
            <ListVideo className="h-4 w-4" />
          )}
          {inList ? "已添加" : "稍后再看"}
        </Button>
        {toast}
      </>
    );
  }

  return (
    <>
      <div className={cn("absolute right-2 top-2 z-20", className)}>
        <button
          type="button"
          title={inList ? "已在稍后再看，点击移除" : "添加到稍后再看"}
          disabled={pending}
          onMouseDown={stopCardNavigation}
          onClick={(event) => void handleClick(event)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            inList && "opacity-100 text-primary",
            pending && "opacity-100",
          )}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : inList ? (
            <Clock className="h-4 w-4 fill-current" />
          ) : (
            <ListVideo className="h-4 w-4" />
          )}
        </button>
      </div>
      {toast}
    </>
  );
}
