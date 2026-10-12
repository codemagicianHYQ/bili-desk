import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLogout } from "@/lib/use-logout";
import type { UpProfile, VideoItem } from "@shared/types";
import { useAppStore } from "@/stores/app-store";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { SpaceTabBar } from "@/components/space/SpaceTabBar";
import { formatCount } from "@/lib/utils";
import { extractIpcErrorMessage, formatUserSpaceError } from "@/lib/ipc-error";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { upProfileCache } from "@/lib/session-data-cache";
import { MyCheesePanel, MyUpowerPanel } from "./MyCheesePanel";
import { MyCollectionsPanel } from "./MyCollectionsPanel";
import { MyDynamicsPanel } from "./MyDynamicsPanel";
import { MyFavoritesPanel } from "./MyFavoritesPanel";
import { MyFollowPanel } from "./MyFollowPanel";
import {
  Bookmark,
  GraduationCap,
  Home,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Radio,
  RefreshCw,
  Settings,
  Video,
  Zap,
} from "lucide-react";

type MyTab =
  | "home"
  | "dynamics"
  | "videos"
  | "collections"
  | "favorites"
  | "follow"
  | "cheese"
  | "upower";

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
  { id: "upower", label: "充电", icon: Zap },
];

export function MyPage() {
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const logout = useLogout();
  const mid = user?.mid ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<MyTab>("home");
  const [visitedTabs, setVisitedTabs] = useState<Set<MyTab>>(
    () => new Set(["home"]),
  );
  const [profile, setProfile] = useState<UpProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSign, setDraftSign] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileTip, setProfileTip] = useState("");
  const [bcoin, setBcoin] = useState("");

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoHasMore, setVideoHasMore] = useState(false);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!user?.isLogin) return;
    let cancelled = false;
    void window.biliDesk.bili
      .getWallet()
      .then((wallet) => {
        if (!cancelled) setBcoin(wallet.bcoin);
      })
      .catch(() => {
        if (!cancelled) setBcoin("");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.isLogin]);

  useEffect(() => {
    if (!user?.isLogin || !mid) {
      setProfileLoading(false);
      return;
    }

    const cached = upProfileCache.get(String(mid));
    if (cached) {
      setProfile(cached);
      setProfileLoading(false);
      setProfileError("");
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError("");

    void window.biliDesk.bili
      .getUpProfile(mid)
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
          upProfileCache.set(String(mid), data);
        }
      })
      .catch((err) => {
        if (!cancelled) setProfileError(formatUserSpaceError(err));
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
        setVideosError(formatUserSpaceError(err));
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

  const openTab = (next: MyTab) => {
    setTab(next);
    setVisitedTabs((prev) => {
      if (prev.has(next)) return prev;
      const copy = new Set(prev);
      copy.add(next);
      return copy;
    });
  };

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
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setDraftName(displayProfile.name);
                    setDraftSign(displayProfile.sign);
                    setProfileTip("");
                    setEditing((open) => !open);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  编辑资料
                </Button>
                <Link to="/settings">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Settings className="h-4 w-4" />
                    设置
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => void logout()}
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </Button>
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
                onClick={() => openTab("videos")}
              >
                <span className="font-semibold text-foreground">
                  {formatCount(displayProfile.videos)}
                </span>
                <span className="ml-1 text-muted-foreground">投稿</span>
              </button>
              {bcoin && (
                <div>
                  <span className="font-semibold text-foreground">{bcoin}</span>
                  <span className="ml-1 text-muted-foreground">B币</span>
                </div>
              )}
            </div>
            {editing && (
              <div className="mt-4 space-y-2 rounded-xl border border-border p-3">
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="昵称"
                  className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none"
                />
                <textarea
                  value={draftSign}
                  onChange={(event) => setDraftSign(event.target.value)}
                  placeholder="个性签名"
                  className="min-h-16 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={profileBusy}
                    onClick={() => {
                      setProfileBusy(true);
                      setProfileTip("");
                      void window.biliDesk.bili
                        .updateMyProfile({ name: draftName, sign: draftSign })
                        .then(() => {
                          setProfile((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  name: draftName.trim(),
                                  sign: draftSign.trim(),
                                }
                              : prev,
                          );
                          if (user) {
                            setUser({
                              ...user,
                              name: draftName.trim() || user.name,
                            });
                          }
                          setProfileTip("资料已保存");
                          setEditing(false);
                        })
                        .catch((err: unknown) =>
                          setProfileTip(
                            extractIpcErrorMessage(err) || "保存失败",
                          ),
                        )
                        .finally(() => setProfileBusy(false));
                    }}
                  >
                    保存
                  </Button>
                  <label className="cursor-pointer text-sm text-primary">
                    更换头像
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setProfileBusy(true);
                        setProfileTip("");
                        void imageFilesToPayload([file])
                          .then((files) => {
                            const faceFile = files[0];
                            if (!faceFile) throw new Error("头像文件是空的");
                            return window.biliDesk.bili.updateMyFace(faceFile);
                          })
                          .then((face) => {
                            if (face) {
                              setProfile((prev) =>
                                prev ? { ...prev, face } : prev,
                              );
                              if (user) setUser({ ...user, face });
                            }
                            setProfileTip("头像已更新");
                          })
                          .catch((err: unknown) =>
                            setProfileTip(
                              extractIpcErrorMessage(err) || "更换头像失败",
                            ),
                          )
                          .finally(() => setProfileBusy(false));
                      }}
                    />
                  </label>
                </div>
                {profileTip && (
                  <p className="text-xs text-muted-foreground">{profileTip}</p>
                )}
              </div>
            )}

            <SpaceTabBar
              className="mt-4"
              tabs={TABS}
              value={tab}
              onChange={openTab}
            />
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
          {tab === "home" && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium">最近投稿</h2>
                {videos.length > 6 && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => openTab("videos")}
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
          )}

          {visitedTabs.has("dynamics") && (
            <div className={tab === "dynamics" ? undefined : "hidden"}>
              <MyDynamicsPanel mid={mid} profile={displayProfile} />
            </div>
          )}

          {visitedTabs.has("collections") && (
            <div className={tab === "collections" ? undefined : "hidden"}>
              <MyCollectionsPanel mid={mid} layout="embedded" />
            </div>
          )}

          {visitedTabs.has("follow") && (
            <div className={tab === "follow" ? undefined : "hidden"}>
              <MyFollowPanel mid={mid} />
            </div>
          )}

          {visitedTabs.has("cheese") && (
            <div className={tab === "cheese" ? undefined : "hidden"}>
              <MyCheesePanel mid={mid} />
            </div>
          )}

          {visitedTabs.has("upower") && (
            <div className={tab === "upower" ? undefined : "hidden"}>
              <MyUpowerPanel mid={mid} />
            </div>
          )}

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

          {visitedTabs.has("favorites") && (
            <div className={tab === "favorites" ? undefined : "hidden"}>
              <MyFavoritesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
