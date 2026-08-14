import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Flame, Loader2, Music2, Star, Trophy } from "lucide-react";
import type {
  MusicRankItem,
  MusicRankPeriod,
  PopularVideoItem,
  WeeklySeriesMeta,
} from "@shared/types";
import { RANKING_PARTITIONS } from "@shared/types";
import { PopularVideoCard } from "@/components/video/PopularVideoCard";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn, formatCount, formatDuration } from "@/lib/utils";

type PopularTab = "popular" | "weekly" | "precious" | "ranking" | "music";

const TABS: Array<{
  id: PopularTab;
  label: string;
  hint: string;
  icon: typeof Flame;
  iconClass: string;
}> = [
  {
    id: "popular",
    label: "综合热门",
    hint: "各个领域中新奇好玩的优质内容都在这里~",
    icon: Flame,
    iconClass: "bg-red-500/15 text-red-500",
  },
  {
    id: "weekly",
    label: "每周必看",
    hint: "每周精选高质量内容，不容错过",
    icon: Trophy,
    iconClass: "bg-amber-400/15 text-amber-400",
  },
  {
    id: "precious",
    label: "入站必刷",
    hint: "我不允许还有人没看过这些宝藏视频",
    icon: Star,
    iconClass: "bg-orange-500/15 text-orange-400",
  },
  {
    id: "ranking",
    label: "排行榜",
    hint: "根据稿件内容质量、近期数据综合展示",
    icon: BarChart3,
    iconClass: "bg-pink-500/15 text-pink-400",
  },
  {
    id: "music",
    label: "全站音乐榜",
    hint: "全站音乐热度周榜，发现当红作品",
    icon: Music2,
    iconClass: "bg-sky-500/15 text-sky-400",
  },
];

const MAX_POPULAR_VIDEOS = 200;

function formatError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatMusicPeriod(period: MusicRankPeriod): string {
  const label =
    period.period > 0 ? `第 ${period.period} 期` : `榜单 ${period.listId}`;
  if (!period.publishTime) return label;
  const date = new Date(period.publishTime * 1000);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${label} · ${date.getFullYear()}-${m}-${d}`;
}

function rankTone(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-orange-400";
  return "text-muted-foreground";
}

function MusicRankCard({ item }: { item: MusicRankItem }) {
  const inner = (
    <div className="group flex gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/60">
      <div
        className={cn(
          "flex w-7 shrink-0 items-start justify-center pt-1 text-lg font-bold tabular-nums",
          rankTone(item.rank),
        )}
      >
        {item.rank}
      </div>
      <div className="relative w-[148px] shrink-0 overflow-hidden rounded-lg bg-muted">
        <div className="aspect-video">
          <BiliImage
            src={item.cover}
            alt={item.title}
            variant="cover"
            className="h-full w-full object-cover"
          />
        </div>
        {item.duration > 0 ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            {formatDuration(item.duration)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
          {item.title}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {item.singer || item.upName || "未知艺人"}
        </p>
        {item.reason ? (
          <span className="mt-2 w-fit rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-400">
            {item.reason}
          </span>
        ) : null}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
          <span>热度 {formatCount(item.heat)}</span>
          {item.play > 0 ? <span>{formatCount(item.play)} 播放</span> : null}
        </div>
      </div>
    </div>
  );

  if (!item.bvid) return inner;
  return <Link to={`/video/${item.bvid}`}>{inner}</Link>;
}

export function PopularPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PopularTab>("popular");

  const [popularVideos, setPopularVideos] = useState<PopularVideoItem[]>([]);
  const [popularHasMore, setPopularHasMore] = useState(true);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularLoadingMore, setPopularLoadingMore] = useState(false);
  const [popularError, setPopularError] = useState("");
  const popularPageRef = useRef(0);
  const popularBusyRef = useRef(false);
  const popularStartedRef = useRef(false);
  const preciousLoadedRef = useRef(false);

  const [weeklyList, setWeeklyList] = useState<WeeklySeriesMeta[]>([]);
  const [weeklyNumber, setWeeklyNumber] = useState(0);
  const [weeklyVideos, setWeeklyVideos] = useState<PopularVideoItem[]>([]);
  const [weeklyHint, setWeeklyHint] = useState("");
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState("");

  const [preciousVideos, setPreciousVideos] = useState<PopularVideoItem[]>([]);
  const [preciousHint, setPreciousHint] = useState("");
  const [preciousLoading, setPreciousLoading] = useState(false);
  const [preciousError, setPreciousError] = useState("");

  const [rankingRid, setRankingRid] = useState(0);
  const [rankingVideos, setRankingVideos] = useState<PopularVideoItem[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const rankingCacheRef = useRef(new Map<number, PopularVideoItem[]>());

  const [musicPeriods, setMusicPeriods] = useState<MusicRankPeriod[]>([]);
  const [musicListId, setMusicListId] = useState(0);
  const [musicItems, setMusicItems] = useState<MusicRankItem[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState("");

  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  const loadPopular = useCallback(async (reset = false) => {
    if (popularBusyRef.current) return;
    popularBusyRef.current = true;
    if (reset) {
      setPopularLoading(true);
      setPopularError("");
      popularPageRef.current = 0;
    } else {
      setPopularLoadingMore(true);
    }
    const nextPage = reset ? 1 : popularPageRef.current + 1;
    try {
      const result = await window.biliDesk.bili.getPopularVideos(nextPage);
      popularPageRef.current = result.page;
      setPopularVideos((prev) => {
        const merged = reset ? result.videos : [...prev, ...result.videos];
        const seen = new Set<string>();
        const unique: PopularVideoItem[] = [];
        for (const video of merged) {
          if (!video.bvid || seen.has(video.bvid)) continue;
          seen.add(video.bvid);
          unique.push(video);
        }
        return unique.slice(0, MAX_POPULAR_VIDEOS);
      });
      setPopularHasMore(
        result.hasMore && result.videos.length > 0 && nextPage < 10,
      );
    } catch (err) {
      setPopularError(formatError(err, "热门列表加载失败"));
    } finally {
      popularBusyRef.current = false;
      setPopularLoading(false);
      setPopularLoadingMore(false);
    }
  }, []);

  const loadWeeklyList = useCallback(async () => {
    setWeeklyLoading(true);
    setWeeklyError("");
    try {
      const list = await window.biliDesk.bili.getWeeklySeriesList();
      setWeeklyList(list);
      const latest = list[0]?.number ?? 0;
      if (latest) setWeeklyNumber((prev) => prev || latest);
    } catch (err) {
      setWeeklyError(formatError(err, "每周必看加载失败"));
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const loadWeeklySeries = useCallback(async (number: number) => {
    if (!number) return;
    setWeeklyLoading(true);
    setWeeklyError("");
    try {
      const detail = await window.biliDesk.bili.getWeeklySeries(number);
      setWeeklyVideos(detail.videos);
      setWeeklyHint(detail.subject || detail.reminder || "");
    } catch (err) {
      setWeeklyError(formatError(err, "每周必看加载失败"));
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const loadPrecious = useCallback(async (force = false) => {
    if (!force && preciousLoadedRef.current) return;
    setPreciousLoading(true);
    setPreciousError("");
    try {
      const result = await window.biliDesk.bili.getPreciousVideos();
      preciousLoadedRef.current = true;
      setPreciousVideos(result.videos);
      setPreciousHint(result.explain || result.title);
    } catch (err) {
      setPreciousError(formatError(err, "入站必刷加载失败"));
    } finally {
      setPreciousLoading(false);
    }
  }, []);

  const loadRanking = useCallback(async (rid: number) => {
    const cached = rankingCacheRef.current.get(rid);
    if (cached) {
      setRankingVideos(cached);
      return;
    }
    setRankingLoading(true);
    setRankingError("");
    try {
      const videos = await window.biliDesk.bili.getRankingVideos(rid);
      rankingCacheRef.current.set(rid, videos);
      setRankingVideos(videos);
    } catch (err) {
      setRankingError(formatError(err, "排行榜加载失败"));
    } finally {
      setRankingLoading(false);
    }
  }, []);

  const loadMusicPeriods = useCallback(async () => {
    if (musicPeriods.length > 0) return;
    setMusicLoading(true);
    setMusicError("");
    try {
      const periods = await window.biliDesk.bili.getMusicRankPeriods();
      setMusicPeriods(periods);
      const latest = periods[0]?.listId ?? 0;
      if (latest) setMusicListId((prev) => prev || latest);
    } catch (err) {
      setMusicError(formatError(err, "音乐榜加载失败"));
    } finally {
      setMusicLoading(false);
    }
  }, [musicPeriods.length]);

  const loadMusicList = useCallback(async (listId: number) => {
    if (!listId) return;
    setMusicLoading(true);
    setMusicError("");
    try {
      const items = await window.biliDesk.bili.getMusicRankList(listId);
      setMusicItems(items);
    } catch (err) {
      setMusicError(formatError(err, "音乐榜加载失败"));
    } finally {
      setMusicLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "popular" || popularStartedRef.current) return;
    popularStartedRef.current = true;
    void loadPopular(true);
  }, [tab, loadPopular]);

  useEffect(() => {
    if (tab === "weekly" && weeklyList.length === 0 && !weeklyLoading) {
      void loadWeeklyList();
    }
  }, [tab, weeklyList.length, weeklyLoading, loadWeeklyList]);

  useEffect(() => {
    if (tab === "weekly" && weeklyNumber > 0) {
      void loadWeeklySeries(weeklyNumber);
    }
  }, [tab, weeklyNumber, loadWeeklySeries]);

  useEffect(() => {
    if (tab === "precious") void loadPrecious();
  }, [tab, loadPrecious]);

  useEffect(() => {
    if (tab === "ranking") void loadRanking(rankingRid);
  }, [tab, rankingRid, loadRanking]);

  useEffect(() => {
    if (tab === "music") void loadMusicPeriods();
  }, [tab, loadMusicPeriods]);

  useEffect(() => {
    if (tab === "music" && musicListId > 0) void loadMusicList(musicListId);
  }, [tab, musicListId, loadMusicList]);

  const handleLoadMorePopular = useCallback(() => {
    if (
      tab !== "popular" ||
      !popularHasMore ||
      popularLoading ||
      popularLoadingMore
    ) {
      return;
    }
    void loadPopular(false);
  }, [tab, popularHasMore, popularLoading, popularLoadingMore, loadPopular]);

  useEffect(() => {
    if (tab !== "popular") return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !popularHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMorePopular();
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, popularHasMore, popularVideos.length, handleLoadMorePopular]);

  const displayVideos = useMemo(() => {
    if (tab === "popular") return popularVideos;
    if (tab === "weekly") return weeklyVideos;
    if (tab === "precious") return preciousVideos;
    if (tab === "ranking") return rankingVideos;
    return [];
  }, [tab, popularVideos, weeklyVideos, preciousVideos, rankingVideos]);

  const loading =
    (tab === "popular" && popularLoading && popularVideos.length === 0) ||
    (tab === "weekly" && weeklyLoading && weeklyVideos.length === 0) ||
    (tab === "precious" && preciousLoading) ||
    (tab === "ranking" && rankingLoading) ||
    (tab === "music" && musicLoading && musicItems.length === 0);

  const error =
    tab === "popular"
      ? popularError
      : tab === "weekly"
        ? weeklyError
        : tab === "precious"
          ? preciousError
          : tab === "ranking"
            ? rankingError
            : musicError;

  const retry = () => {
    if (tab === "popular") void loadPopular(true);
    else if (tab === "weekly") {
      if (weeklyNumber) void loadWeeklySeries(weeklyNumber);
      else void loadWeeklyList();
    } else if (tab === "precious") {
      preciousLoadedRef.current = false;
      void loadPrecious(true);
    } else if (tab === "ranking") {
      rankingCacheRef.current.delete(rankingRid);
      void loadRanking(rankingRid);
    } else if (musicListId) void loadMusicList(musicListId);
    else void loadMusicPeriods();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pt-4">
        <div className="flex flex-wrap gap-1">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                }}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    item.iconClass,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-xs text-muted-foreground">
            {tab === "weekly" && weeklyHint ? weeklyHint : activeTab.hint}
            {tab === "precious" && preciousHint ? ` · ${preciousHint}` : ""}
          </p>
          {tab === "weekly" && weeklyList.length > 0 ? (
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={weeklyNumber}
              onChange={(event) => setWeeklyNumber(Number(event.target.value))}
            >
              {weeklyList.slice(0, 40).map((item) => (
                <option key={item.number} value={item.number}>
                  {item.name || `第 ${item.number} 期`}
                  {item.subject ? ` · ${item.subject}` : ""}
                </option>
              ))}
            </select>
          ) : null}
          {tab === "music" && musicPeriods.length > 0 ? (
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={musicListId}
              onChange={(event) => setMusicListId(Number(event.target.value))}
            >
              {musicPeriods.slice(0, 40).map((item) => (
                <option key={item.listId} value={item.listId}>
                  {formatMusicPeriod(item)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {tab === "ranking" ? (
          <div className="flex flex-wrap gap-1.5 pb-3">
            {RANKING_PARTITIONS.map((item) => (
              <button
                key={item.rid}
                type="button"
                onClick={() => setRankingRid(item.rid)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  rankingRid === item.rid
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={scrollRef} className="scrollbar-overlay flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : error &&
          ((tab === "music" && musicItems.length === 0) ||
            (tab !== "music" && displayVideos.length === 0)) ? (
          <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={retry}>
              重试
            </Button>
          </div>
        ) : tab === "music" ? (
          <div className="grid grid-cols-1 gap-1 p-4 xl:grid-cols-2">
            {musicItems.map((item) => (
              <MusicRankCard key={`${item.musicId}-${item.rank}`} item={item} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-1 p-4 xl:grid-cols-2">
              {displayVideos.map((video, index) => (
                <PopularVideoCard
                  key={video.bvid}
                  video={
                    tab === "ranking" || !video.rank
                      ? { ...video, rank: video.rank ?? index + 1 }
                      : video
                  }
                  showRank={tab === "ranking"}
                />
              ))}
            </div>
            {tab === "popular" ? (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              >
                {popularLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载更多...
                  </>
                ) : popularHasMore ? (
                  "继续下滑加载更多"
                ) : displayVideos.length > 0 ? (
                  "已经到底了"
                ) : null}
              </div>
            ) : displayVideos.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                暂无内容
              </p>
            ) : (
              <div className="h-8" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
