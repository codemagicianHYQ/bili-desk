import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { SeasonDetail, SeasonEpisode, VideoPlayInfo } from "@shared/types";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { BiliImage } from "@/components/ui/bili-image";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatDuration } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function SeasonPage() {
  const { kind = "bangumi", id = "" } = useParams<{
    kind: "bangumi" | "cheese";
    id: string;
  }>();
  const [searchParams] = useSearchParams();
  const seasonKind = kind === "cheese" ? "cheese" : "bangumi";
  const numericId = Number(id);
  const by = searchParams.get("by") === "ep" ? "ep" : "season";
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [episode, setEpisode] = useState<SeasonEpisode | null>(null);
  const [playInfo, setPlayInfo] = useState<VideoPlayInfo | null>(null);
  const [qn, setQn] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [playError, setPlayError] = useState("");
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError("剧集 ID 无效");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setPlayInfo(null);
    void window.biliDesk.bili
      .getSeason(seasonKind, numericId, by)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        const preferred =
          by === "ep"
            ? next.episodes.find((item) => item.epId === numericId)
            : next.episodes[0];
        setEpisode(preferred ?? next.episodes[0] ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(extractIpcErrorMessage(err) || "剧集加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seasonKind, numericId, by]);

  useEffect(() => {
    if (!episode) return;
    let cancelled = false;
    setPlayError("");
    setPlayInfo(null);
    void window.biliDesk.bili
      .getSeasonPlayUrl(seasonKind, episode.epId, episode.cid, qn)
      .then((info) => {
        if (!cancelled) setPlayInfo(info);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPlayError(extractIpcErrorMessage(err) || "该集暂不能播放");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [seasonKind, episode, qn]);

  const toggleFollow = () => {
    if (!detail || followBusy) return;
    const next = !detail.followed;
    setFollowBusy(true);
    setError("");
    void window.biliDesk.bili
      .setSeasonFollow(seasonKind, detail.seasonId, next)
      .then(() => setDetail({ ...detail, followed: next }))
      .catch((err: unknown) =>
        setError(extractIpcErrorMessage(err) || "更新追番状态失败"),
      )
      .finally(() => setFollowBusy(false));
  };

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/" label="返回" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
          {loading && (
            <p className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载剧集...
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {detail && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold">{detail.title}</h1>
                  {detail.score > 0 && (
                    <p className="mt-1 text-sm text-primary">
                      评分 {detail.score.toFixed(1)}
                    </p>
                  )}
                  {detail.evaluate && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {detail.evaluate}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={followBusy || detail.seasonId <= 0}
                  className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary disabled:opacity-50"
                  onClick={toggleFollow}
                >
                  {detail.followed
                    ? seasonKind === "cheese"
                      ? "已收藏"
                      : "已追"
                    : seasonKind === "cheese"
                      ? "收藏课程"
                      : "追番"}
                </button>
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                {playInfo && episode ? (
                  <VideoPlayer
                    className="h-full w-full"
                    playInfo={playInfo}
                    aid={episode.aid}
                    bvid={episode.bvid}
                    cid={episode.cid}
                    poster={episode.cover || detail.cover}
                    onQualityChange={setQn}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
                    {playError || "正在加载播放地址..."}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {detail.episodes.map((item) => (
                  <button
                    key={item.epId}
                    type="button"
                    className={cn(
                      "overflow-hidden rounded-lg border border-border text-left",
                      episode?.epId === item.epId && "border-primary",
                    )}
                    onClick={() => setEpisode(item)}
                  >
                    {item.cover ? (
                      <BiliImage
                        src={item.cover}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                    ) : null}
                    <span className="block px-2 py-1.5 text-xs">
                      <span className="line-clamp-2">{item.title}</span>
                      {item.badge && (
                        <span className="mt-0.5 block text-primary">
                          {item.badge}
                        </span>
                      )}
                      {item.duration > 0 && (
                        <span className="mt-0.5 block text-muted-foreground">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
