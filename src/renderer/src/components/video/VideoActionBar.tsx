import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VideoDetail, VideoRelation } from "@shared/types";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import { VideoFavButton } from "@/components/video/VideoFavButton";
import { Coins, Loader2, Share2, ThumbsUp, X } from "lucide-react";

interface VideoActionBarProps {
  video: VideoDetail;
  className?: string;
}

function formatActionError(err: unknown): string {
  const message = err instanceof Error ? err.message : "操作失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

export function VideoActionBar({ video, className }: VideoActionBarProps) {
  const [relation, setRelation] = useState<VideoRelation | null>(null);
  const [likeCount, setLikeCount] = useState(video.stat.like);
  const [coinCount, setCoinCount] = useState(video.stat.coin);
  const [favoriteCount, setFavoriteCount] = useState(video.stat.favorite);
  const [shareCount, setShareCount] = useState(video.stat.share);
  const [busy, setBusy] = useState<"like" | "coin" | "share" | null>(null);
  const [coinOpen, setCoinOpen] = useState(false);
  const [selectLike, setSelectLike] = useState(true);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLikeCount(video.stat.like);
    setCoinCount(video.stat.coin);
    setFavoriteCount(video.stat.favorite);
    setShareCount(video.stat.share);
    setRelation(null);
    setError("");
    setHint("");
  }, [video.aid, video.stat]);

  const loadRelation = useCallback(async () => {
    try {
      const next = await window.biliDesk.bili.getVideoRelation(
        video.bvid,
        video.aid,
      );
      setRelation(next);
    } catch {
      // 未登录时忽略关系查询
    }
  }, [video.aid, video.bvid]);

  useEffect(() => {
    void loadRelation();
  }, [loadRelation]);

  useEffect(() => {
    if (!coinOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy !== "coin") setCoinOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [coinOpen, busy]);

  const showHint = (message: string) => {
    setHint(message);
    window.setTimeout(() => {
      setHint((prev) => (prev === message ? "" : prev));
    }, 2200);
  };

  const handleLike = async () => {
    if (busy) return;
    const nextLiked = !relation?.liked;
    setBusy("like");
    setError("");
    try {
      await window.biliDesk.bili.likeVideo(video.aid, nextLiked);
      setRelation((prev) => ({
        liked: nextLiked,
        coined: prev?.coined ?? false,
        coin: prev?.coin ?? 0,
        favorited: prev?.favorited ?? false,
      }));
      setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    } catch (err) {
      setError(formatActionError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleCoin = async (multiply: 1 | 2) => {
    if (busy) return;
    const already = relation?.coin ?? 0;
    if (already >= 2) {
      setError("该视频已投满 2 枚硬币");
      return;
    }
    if (already + multiply > 2) {
      setError("最多还可再投 1 枚硬币");
      return;
    }

    setBusy("coin");
    setError("");
    try {
      const willLike = selectLike && !relation?.liked;
      await window.biliDesk.bili.addCoin({
        aid: video.aid,
        bvid: video.bvid,
        multiply,
        selectLike: willLike,
      });
      setRelation((prev) => ({
        liked: willLike ? true : (prev?.liked ?? false),
        coined: true,
        coin: (prev?.coin ?? 0) + multiply,
        favorited: prev?.favorited ?? false,
      }));
      setCoinCount((count) => count + multiply);
      if (willLike) setLikeCount((count) => count + 1);
      setCoinOpen(false);
      showHint(`已投币 ${multiply} 枚`);
    } catch (err) {
      setError(formatActionError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy("share");
    setError("");
    const url = `https://www.bilibili.com/video/${video.bvid}`;
    try {
      await navigator.clipboard.writeText(url);
      try {
        await window.biliDesk.bili.shareVideo(video.aid, video.bvid);
        setShareCount((count) => count + 1);
      } catch {
        // 未登录时仍保留复制链接
      }
      showHint("已复制分享链接");
    } catch (err) {
      setError(formatActionError(err));
    } finally {
      setBusy(null);
    }
  };

  const liked = relation?.liked ?? false;
  const coined = (relation?.coin ?? 0) > 0;
  const remainingCoins = Math.max(0, 2 - (relation?.coin ?? 0));

  const coinDialog = coinOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => {
            if (busy !== "coin") setCoinOpen(false);
          }}
        >
          <div
            className="relative z-[10000] w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">给 UP 主投币</p>
                <p className="text-xs text-muted-foreground">
                  {remainingCoins > 0
                    ? `本视频还可投 ${remainingCoins} 枚`
                    : "本视频已投满"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === "coin"}
                onClick={() => setCoinOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selectLike}
                  disabled={liked || busy === "coin"}
                  onChange={(event) => setSelectLike(event.target.checked)}
                />
                <span className={cn(liked && "text-muted-foreground")}>
                  {liked ? "已点赞" : "同时点赞"}
                </span>
              </label>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={busy === "coin" || remainingCoins < 1}
                  onClick={() => void handleCoin(1)}
                >
                  {busy === "coin" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "投 1 币"
                  )}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy === "coin" || remainingCoins < 2}
                  onClick={() => void handleCoin(2)}
                >
                  投 2 币
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy === "like"}
          className={cn(
            "gap-1.5",
            liked ? "bili-action-btn-active" : "bili-action-btn",
          )}
          onClick={() => void handleLike()}
        >
          {busy === "like" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ThumbsUp className={cn("h-4 w-4", liked && "fill-current")} />
          )}
          {formatCount(likeCount)}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy === "coin"}
          className={cn(
            "gap-1.5",
            coined ? "bili-action-btn-active" : "bili-action-btn",
          )}
          onClick={() => {
            setError("");
            setSelectLike(!liked);
            setCoinOpen(true);
          }}
        >
          <Coins className="h-4 w-4" />
          {formatCount(coinCount)}
        </Button>

        <VideoFavButton
          aid={video.aid}
          count={favoriteCount}
          onCollectedChange={(collected) => {
            setFavoriteCount((count) =>
              Math.max(0, count + (collected ? 1 : -1)),
            );
          }}
        />

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy === "share"}
          className="bili-action-btn gap-1.5"
          onClick={() => void handleShare()}
        >
          {busy === "share" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {formatCount(shareCount)}
        </Button>
      </div>

      {(hint || (error && !coinOpen)) && (
        <p
          className={cn(
            "text-xs",
            error && !coinOpen ? "text-red-400" : "text-muted-foreground",
          )}
        >
          {error && !coinOpen ? error : hint}
        </p>
      )}

      {coinDialog}
    </div>
  );
}
