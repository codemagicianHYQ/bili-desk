import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListVideo, Volume2 } from "lucide-react";
import type { VideoPagePart, VideoUgcSeason } from "@shared/types";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface VideoPlaylistPanelProps {
  bvid: string;
  selectedCid: number | null;
  pages: VideoPagePart[];
  ugcSeason?: VideoUgcSeason;
  onSelectPart: (cid: number) => void;
  className?: string;
}

export function VideoPlaylistPanel({
  bvid,
  selectedCid,
  pages,
  ugcSeason,
  onSelectPart,
  className,
}: VideoPlaylistPanelProps) {
  const navigate = useNavigate();
  const selfMid = useAppStore((state) => state.user?.mid);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState("");
  const [showIntro, setShowIntro] = useState(false);
  const statusSeqRef = useRef(0);

  const hasSeason = Boolean(ugcSeason && ugcSeason.episodes.length > 0);
  const hasPages = pages.length > 1;
  const seasonIndex =
    ugcSeason?.episodes.findIndex((ep) => ep.bvid === bvid) ?? -1;
  const pageIndex = pages.findIndex((part) => part.cid === selectedCid);
  const isOwnSeason =
    Boolean(selfMid) &&
    Boolean(ugcSeason?.mid) &&
    Number(selfMid) === Number(ugcSeason?.mid);
  const canSubscribe = hasSeason && !isOwnSeason && Boolean(selfMid);

  useEffect(() => {
    if (!hasSeason && !hasPages) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [bvid, selectedCid, hasSeason, hasPages]);

  useEffect(() => {
    setShowIntro(false);
    setSubError("");
    if (!ugcSeason?.id || isOwnSeason || !selfMid) {
      setSubscribed(false);
      return;
    }

    const seq = ++statusSeqRef.current;
    // 后台查状态，不阻塞按钮可点
    void window.biliDesk.bili
      .getUgcSeasonSubscribed(ugcSeason.id)
      .then((value) => {
        if (seq !== statusSeqRef.current) return;
        setSubscribed(value);
      })
      .catch(() => {
        if (seq !== statusSeqRef.current) return;
        setSubscribed(false);
      });
  }, [ugcSeason?.id, isOwnSeason, selfMid]);

  if (!hasSeason && !hasPages) return null;

  const handleToggleSubscribe = async () => {
    if (!ugcSeason?.id || subBusy || isOwnSeason) return;
    if (!selfMid) {
      setSubError("请先登录后再订阅合集");
      return;
    }
    setSubBusy(true);
    setSubError("");
    const next = !subscribed;
    // 先乐观更新，失败再回滚
    setSubscribed(next);
    try {
      await window.biliDesk.bili.setUgcSeasonSubscribe(ugcSeason.id, next);
    } catch (err) {
      const message = extractIpcErrorMessage(err) || "操作失败";
      // 已订阅时再点订阅：同步成已订阅态
      if (
        next &&
        (message.includes("已订阅") ||
          message.includes("已经收藏") ||
          message.includes("重复"))
      ) {
        setSubscribed(true);
      } else {
        setSubscribed(!next);
        setSubError(message);
      }
    } finally {
      setSubBusy(false);
    }
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-secondary/20",
        className,
      )}
    >
      {hasSeason && ugcSeason && (
        <div className="border-b border-border last:border-b-0">
          <header className="space-y-2 border-b border-border/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <ListVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {ugcSeason.title}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({seasonIndex >= 0 ? seasonIndex + 1 : "-"}/
                  {ugcSeason.epCount || ugcSeason.episodes.length})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                {typeof ugcSeason.view === "number" && ugcSeason.view > 0 && (
                  <span>{formatCount(ugcSeason.view)} 播放</span>
                )}
                {ugcSeason.intro && (
                  <button
                    type="button"
                    className="ml-2 text-primary hover:underline"
                    onClick={() => setShowIntro((v) => !v)}
                  >
                    简介
                  </button>
                )}
              </div>
              {canSubscribe && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8 shrink-0 px-3 text-sm",
                    subscribed
                      ? "border-border text-muted-foreground"
                      : "border-primary/50 text-primary hover:bg-primary/10",
                  )}
                  disabled={subBusy}
                  onClick={() => void handleToggleSubscribe()}
                >
                  {subBusy ? "处理中..." : subscribed ? "已订阅" : "订阅合集"}
                </Button>
              )}
            </div>
            {showIntro && ugcSeason.intro && (
              <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
                {ugcSeason.intro}
              </p>
            )}
            {subError && (
              <p className="pl-6 text-xs text-red-400">{subError}</p>
            )}
          </header>
          <div className="max-h-64 overflow-y-auto overscroll-contain px-1 pb-1 pt-1">
            {ugcSeason.episodes.map((ep, index) => {
              const active = ep.bvid === bvid;
              return (
                <button
                  key={ep.bvid}
                  ref={active ? activeRef : undefined}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-secondary/80",
                  )}
                  onClick={() => {
                    if (active) return;
                    navigate(`/video/${ep.bvid}`);
                  }}
                >
                  <span className="flex w-5 shrink-0 justify-center">
                    {active ? (
                      <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    ({index + 1}){ep.title}
                  </span>
                  {ep.duration > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDuration(ep.duration)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasPages && (
        <div>
          <header className="flex items-center gap-2 px-3 py-2.5 text-sm">
            <ListVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">
              视频选集
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              ({pageIndex >= 0 ? pageIndex + 1 : "-"}/{pages.length})
            </span>
          </header>
          <div className="max-h-64 overflow-y-auto overscroll-contain px-1 pb-1">
            {pages.map((part) => {
              const active = part.cid === selectedCid;
              return (
                <button
                  key={part.cid}
                  ref={active && !hasSeason ? activeRef : undefined}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-secondary/80",
                  )}
                  onClick={() => onSelectPart(part.cid)}
                >
                  <span className="flex w-5 shrink-0 justify-center">
                    {active ? (
                      <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {part.page}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    ({part.page}){part.part}
                  </span>
                  {part.duration > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDuration(part.duration)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
