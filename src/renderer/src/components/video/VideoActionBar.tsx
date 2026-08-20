import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VideoDetail, VideoRelation } from "@shared/types";
import { cn, formatCount } from "@/lib/utils";
import {
  ActionCelebrate,
  type CelebrateKind,
} from "@/components/video/ActionCelebrate";
import { CoinTossDialog } from "@/components/video/CoinTossDialog";
import { VideoFavButton } from "@/components/video/VideoFavButton";
import { Loader2 } from "lucide-react";

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

function LikeGlyph({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="bili-toolbar-icon h-6 w-6" aria-hidden>
      <path
        d="M7.5 10.2V20H5.2A1.7 1.7 0 0 1 3.5 18.3v-6.4A1.7 1.7 0 0 1 5.2 10.2h2.3Zm2.1-.1 3.2-5.5a1.9 1.9 0 0 1 3.4 1.4l-.7 3.3h4.3a2.3 2.3 0 0 1 2.2 2.8l-1.3 6.1A2.7 2.7 0 0 1 17.9 20H9.6V10.1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoinGlyph({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="bili-toolbar-icon h-6 w-6" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="8.2"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        opacity={filled ? 0.22 : 1}
      />
      <circle
        cx="12"
        cy="12"
        r="8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="currentColor"
      >
        币
      </text>
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="bili-toolbar-icon h-6 w-6" aria-hidden>
      <circle cx="18" cy="5.5" r="2.3" fill="currentColor" />
      <circle cx="18" cy="18.5" r="2.3" fill="currentColor" />
      <circle cx="6" cy="12" r="2.3" fill="currentColor" />
      <path
        d="M8.1 11.1 15.7 6.7M8.1 12.9l7.6 4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
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
  const [celebrate, setCelebrate] = useState<CelebrateKind | null>(null);
  const [popLike, setPopLike] = useState(false);
  const [popCoin, setPopCoin] = useState(false);

  useEffect(() => {
    setLikeCount(video.stat.like);
    setCoinCount(video.stat.coin);
    setFavoriteCount(video.stat.favorite);
    setShareCount(video.stat.share);
    setRelation(null);
    setError("");
    setHint("");
    setCelebrate(null);
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

  const showHint = (message: string) => {
    setHint(message);
    window.setTimeout(() => {
      setHint((prev) => (prev === message ? "" : prev));
    }, 2200);
  };

  const triggerPop = (kind: CelebrateKind) => {
    setCelebrate(kind);
    if (kind === "like") {
      setPopLike(true);
      window.setTimeout(() => setPopLike(false), 560);
    } else {
      setPopCoin(true);
      window.setTimeout(() => setPopCoin(false), 560);
    }
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
      if (nextLiked) triggerPop("like");
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
      if (willLike) {
        setLikeCount((count) => count + 1);
        setPopLike(true);
        window.setTimeout(() => setPopLike(false), 560);
      }
      triggerPop("coin");
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
        const counted = await window.biliDesk.bili.shareVideo(
          video.aid,
          video.bvid,
        );
        if (counted) setShareCount((count) => count + 1);
      } catch {
        // 复制链接已成功，分享计数失败不影响
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

  return (
    <div className={cn("shrink-0 space-y-2", className)}>
      <div className="flex flex-nowrap items-center gap-1 sm:gap-3">
        <button
          type="button"
          disabled={busy === "like"}
          className={cn(
            "bili-toolbar-action",
            liked && "is-active",
            popLike && "is-pop",
          )}
          onClick={() => void handleLike()}
          title={liked ? "取消点赞" : "点赞"}
        >
          <ActionCelebrate
            kind="like"
            open={celebrate === "like"}
            onDone={() =>
              setCelebrate((prev) => (prev === "like" ? null : prev))
            }
          />
          {busy === "like" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <LikeGlyph filled={liked} />
          )}
          <span className="bili-toolbar-count">{formatCount(likeCount)}</span>
        </button>

        <button
          type="button"
          disabled={busy === "coin"}
          className={cn(
            "bili-toolbar-action",
            coined && "is-coin-active",
            popCoin && "is-pop",
          )}
          onClick={() => {
            setError("");
            setSelectLike(!liked);
            setCoinOpen(true);
          }}
          title="投币"
        >
          <ActionCelebrate
            kind="coin"
            open={celebrate === "coin"}
            onDone={() =>
              setCelebrate((prev) => (prev === "coin" ? null : prev))
            }
          />
          <CoinGlyph filled={coined} />
          <span className="bili-toolbar-count">{formatCount(coinCount)}</span>
        </button>

        <VideoFavButton
          aid={video.aid}
          count={favoriteCount}
          appearance="toolbar"
          onCollectedChange={(collected) => {
            setFavoriteCount((count) =>
              Math.max(0, count + (collected ? 1 : -1)),
            );
          }}
        />

        <button
          type="button"
          disabled={busy === "share"}
          className="bili-toolbar-action"
          onClick={() => void handleShare()}
          title="分享"
        >
          {busy === "share" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ShareGlyph />
          )}
          <span className="bili-toolbar-count">{formatCount(shareCount)}</span>
        </button>
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

      {createPortal(
        <CoinTossDialog
          open={coinOpen}
          remainingCoins={remainingCoins}
          liked={liked}
          selectLike={selectLike}
          loading={busy === "coin"}
          error={coinOpen ? error : ""}
          onSelectLikeChange={setSelectLike}
          onConfirm={(multiply) => void handleCoin(multiply)}
          onClose={() => {
            if (busy !== "coin") setCoinOpen(false);
          }}
        />,
        document.body,
      )}
    </div>
  );
}
