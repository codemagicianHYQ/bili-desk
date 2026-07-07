import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { UpProfile, VideoItem } from "@shared/types";
import { useAppStore } from "@/stores/app-store";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { cn, formatCount } from "@/lib/utils";
import { MyCheesePanel } from "./MyCheesePanel";
import { MyCollectionsPanel } from "./MyCollectionsPanel";
import { MyDynamicsPanel } from "./MyDynamicsPanel";
import { MyFavoritesPanel } from "./MyFavoritesPanel";
import { MyFollowPanel } from "./MyFollowPanel";
import {
  Bookmark,
  Clock,
  GraduationCap,
  Home,
  Layers,
  Loader2,
  Radio,
  RefreshCw,
  Settings,
  Users,
  Video,
} from "lucide-react";

type MyTab =
  | "home"
  | "dynamics"
  | "videos"
  | "collections"
  | "favorites"
  | "follow"
  | "cheese";

function formatPageError(err: unknown): string {
  const message = err instanceof Error ? err.message : "加载失败";
  if (message.startsWith("Error invoking remote method")) {
    return "加载失败，请稍后重试";
  }
  return message;
}

function normalizeUpVideosPage(data: unknown): {
  videos: VideoItem[];
  page: number;
  hasMore: boolean;
} {
  if (Array.isArray(data)) {
    return { videos: data, page: 1, hasMore: data.length >= 30 };
  }
  const payload = data as {
    videos?: VideoItem[];
    page?: number;
    hasMore?: boolean;
  };
  const videos = payload?.videos ?? [];
  return {
    videos,
    page: payload?.page ?? 1,
    hasMore: payload?.hasMore ?? videos.length >= 30,
  };
}

const TABS: Array<{ id: MyTab; label: string; icon: typeof Home }> = [
  { id: "home", label: "主页", icon: Home },
  { id: "dynamics", label: "动态", icon: Radio },
  { id: "videos", label: "投稿", icon: Video },
  { id: "collections", label: "合集", icon: Layers },
  { id: "favorites", label: "收藏", icon: Bookmark },
  { id: "follow", label: "追更", icon: RefreshCw },
  { id: "cheese", label: "课堂", icon: GraduationCap },
];

export function MyPage() {
  const user = useAppStore((state) => state.user);
  const mid = user?.mid ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<MyTab>("home");
  const [profile, setProfile] = useState<UpProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoHasMore, setVideoHasMore] = useState(false);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!user?.isLogin || !mid) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError("");

    void window.biliDesk.bili
      .getUpProfile(mid)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setProfileError(formatPageError(err));
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.isLogin, mid]);

  const loadVideos = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!mid) return;

      if (append) setLoadingMore(true);
      else setVideosLoading(true);
      setVideosError("");

      try {
        const result = normalizeUpVideosPage(
          await window.biliDesk.bili.getUpVideos(mid, nextPage),
        );
        setVideos((prev) => {
          if (!append) return result.videos;
          const seen = new Set(prev.map((item) => item.bvid));
          const merged = [...prev];
          for (const item of result.videos) {
            if (!seen.has(item.bvid)) merged.push(item);
          }
          return merged;
        });
        setVideoPage(result.page);
        setVideoHasMore(result.hasMore);
      } catch (err) {
        setVideosError(formatPageError(err));
      } finally {
        setVideosLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  useEffect(() => {
    if (!mid || (tab !== "home" && tab !== "videos")) return;
    if (tab === "home" && videos.length > 0) return;
    if (tab === "videos" && videos.length > 0) return;
    void loadVideos(1, false);
  }, [mid, tab, loadVideos, videos.length]);

  const loadMoreVideos = useCallback(async () => {
    if (!videoHasMore || loadingMore || videosLoading) return;
    await loadVideos(videoPage + 1, true);
  }, [videoHasMore, loadingMore, videosLoading, loadVideos, videoPage]);

  useEffect(() => {
    if (tab !== "videos") return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !videoHasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreVideos();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, videoHasMore, loadMoreVideos]);

  if (!user?.isLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm">登录后查看个人主页</p>
        <Link to="/login">
          <Button size="sm">去登录</Button>
        </Link>
      </div>
    );
  }

  if (profileLoading && !profile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载个人资料...
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {profileError}
      </div>
    );
  }

  const displayProfile = profile ?? {
    mid,
    name: user.name,
    face: user.face,
    sign: "",
    fans: 0,
    following: 0,
    videos: 0,
    topPhoto: "",
  };

  const homePreviewVideos = videos.slice(0, 6);
  const showVideoGrid = tab === "videos" ? videos : homePreviewVideos;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={scrollRef} className="scrollbar-overlay flex-1 overflow-y-auto">
        <div className="border-b border-border">
          <div className="relative h-44 overflow-hidden">
            {displayProfile.topPhoto ? (
              <>
                <BiliImage
                  src={displayProfile.topPhoto}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/25" />
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-sky-700/70 via-primary/55 to-rose-600/55" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/80 to-transparent" />
          </div>

          <div className="relative mx-auto max-w-5xl px-6 pb-4">
            <div className="-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <BiliImage
                  src={displayProfile.face || user.face}
                  alt={displayProfile.name}
                  className="h-24 w-24 shrink-0 rounded-full border-4 border-background object-cover ring-2 ring-primary/30"
                />
                <div className="min-w-0 pb-1">
                  <h1 className="truncate text-2xl font-semibold">
                    {displayProfile.name}
                  </h1>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {displayProfile.sign || "这个人很懒，什么都没有写~"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pb-1">
                <Link to="/settings">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Settings className="h-4 w-4" />
                    设置
                  </Button>
                </Link>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-6 text-sm">
              <Link
                to="/following"
                className="transition-colors hover:text-primary"
              >
                <span className="font-semibold text-foreground">
                  {formatCount(displayProfile.following)}
                </span>
                <span className="ml-1 text-muted-foreground">关注</span>
              </Link>
              <div>
                <span className="font-semibold text-foreground">
                  {formatCount(displayProfile.fans)}
                </span>
                <span className="ml-1 text-muted-foreground">粉丝</span>
              </div>
              <button
                type="button"
                className="transition-colors hover:text-primary"
                onClick={() => setTab("videos")}
              >
                <span className="font-semibold text-foreground">
                  {formatCount(displayProfile.videos)}
                </span>
                <span className="ml-1 text-muted-foreground">投稿</span>
              </button>
            </div>

            <div className="scrollbar-overlay mt-4 flex gap-1 overflow-x-auto border-b border-border">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors",
                    tab === id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
          {tab === "home" && (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                  to="/following"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
                >
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">我的关注</p>
                    <p className="text-xs text-muted-foreground">
                      管理 UP 主分组
                    </p>
                  </div>
                </Link>
                <Link
                  to="/favorites"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
                >
                  <Bookmark className="h-5 w-5 text-sky-400" />
                  <div>
                    <p className="text-sm font-medium">收藏夹</p>
                    <p className="text-xs text-muted-foreground">
                      本地二级分类
                    </p>
                  </div>
                </Link>
                <Link
                  to="/watch-later"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
                >
                  <Clock className="h-5 w-5 text-sky-400" />
                  <div>
                    <p className="text-sm font-medium">稍后再看</p>
                    <p className="text-xs text-muted-foreground">
                      同步 B 站列表
                    </p>
                  </div>
                </Link>
                <Link
                  to="/settings"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
                >
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">设置</p>
                    <p className="text-xs text-muted-foreground">主题与 AI</p>
                  </div>
                </Link>
              </section>

              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-medium">最近投稿</h2>
                  {videos.length > 6 && (
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setTab("videos")}
                    >
                      查看全部
                    </button>
                  )}
                </div>
                {videosLoading && videos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">加载中...</p>
                ) : showVideoGrid.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    {showVideoGrid.map((video) => (
                      <VideoCard key={video.bvid} video={video} meta="stats" />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无投稿视频</p>
                )}
              </section>
            </>
          )}

          {tab === "dynamics" && <MyDynamicsPanel mid={mid} />}

          {tab === "collections" && <MyCollectionsPanel mid={mid} />}

          {tab === "follow" && <MyFollowPanel mid={mid} />}

          {tab === "cheese" && <MyCheesePanel mid={mid} />}

          {tab === "videos" && (
            <section>
              {videosLoading && videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">加载投稿中...</p>
              ) : videosError && videos.length === 0 ? (
                <p className="text-sm text-red-400">{videosError}</p>
              ) : videos.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    {videos.map((video) => (
                      <VideoCard key={video.bvid} video={video} meta="stats" />
                    ))}
                  </div>
                  <div
                    ref={sentinelRef}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    {loadingMore
                      ? "加载更多..."
                      : videoHasMore
                        ? "继续下滑加载更多"
                        : "已经到底啦"}
                  </div>
                  {videosError && (
                    <p className="text-sm text-red-400">{videosError}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">暂无投稿</p>
              )}
            </section>
          )}

          {tab === "favorites" && <MyFavoritesPanel />}
        </div>
      </div>
    </div>
  );
}
