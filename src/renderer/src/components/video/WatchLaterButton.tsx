import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { VideoItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

function formatWatchLaterError(err: unknown): string {
  const message = err instanceof Error ? err.message : "操作失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
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

  useEffect(() => {
    if (user?.isLogin) void ensureLoaded();
  }, [user?.isLogin, ensureLoaded]);

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!user?.isLogin) {
      navigate("/login");
      return;
    }

    const wasInList = inList;
    setPending(true);
    setTip("");
    try {
      await toggle(aid, bvid, video);
      setTip(wasInList ? "已从稍后再看移除" : "已添加到稍后再看");
      window.setTimeout(() => setTip(""), 1800);
    } catch (err) {
      setTip(formatWatchLaterError(err));
      window.setTimeout(() => setTip(""), 2500);
    } finally {
      setPending(false);
    }
  };

  if (variant === "inline") {
    return (
      <div className="relative">
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
            <Clock className="h-4 w-4 fill-current text-sky-200" />
          ) : (
            <ListVideo className="h-4 w-4" />
          )}
          {inList ? "已添加" : "稍后再看"}
        </Button>
        {tip && (
          <span className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
            {tip}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("absolute right-2 top-2 z-10", className)}>
      <button
        type="button"
        title={inList ? "已在稍后再看，点击移除" : "添加到稍后再看"}
        disabled={pending}
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
      {tip && (
        <span className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs text-white">
          {tip}
        </span>
      )}
    </div>
  );
}
