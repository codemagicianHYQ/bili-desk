import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import type {
  UpProfile,
  UpRelation,
  UpVideosOrder,
  UserRelationListType,
  VideoItem,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { FollowButton } from "@/components/video/FollowButton";
import { VideoCard } from "@/components/video/VideoCard";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { UpRelationListPanel } from "@/features/up/UpRelationListPanel";
import { cn, formatCount } from "@/lib/utils";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { useAppStore } from "@/stores/app-store";

const GRID_COLS_CLASS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
} as const;

const ORDER_OPTIONS: Array<{ value: UpVideosOrder; label: string }> = [
  { value: "pubdate", label: "按时间" },
  { value: "click", label: "按播放量" },
];

const PAGE_SIZE = 30;

function parseMid(value: string | undefined): number {
  if (!value) return 0;
  const mid = Number(value);
  return Number.isFinite(mid) && mid > 0 ? mid : 0;
}

export function UpSpacePage() {
  const { mid: midParam } = useParams<{ mid: string }>();
  const mid = parseMid(midParam);
  const homeGridColumns = useAppStore((state) => state.homeGridColumns);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadSeqRef = useRef(0);
  const [profile, setProfile] = useState<UpProfile | null>(null);
  const [relation, setRelation] = useState<UpRelation | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [order, setOrder] = useState<UpVideosOrder>("pubdate");
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [videosError, setVideosError] = useState("");
  const [videosLoading, setVideosLoading] = useState(true);
  const [relationPanel, setRelationPanel] =
    useState<UserRelationListType | null>(null);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const totalPages = useMemo(() => {
    if (total > 0) return Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (hasMore) return Math.max(page + 1, 1);
    return Math.max(page, 1);
  }, [total, hasMore, page]);

  const loadVideos = useCallback(
    async (targetMid: number, nextPage: number, nextOrder: UpVideosOrder) => {
      const seq = ++loadSeqRef.current;
      setVideosLoading(true);
      setVideosError("");

      try {
        const result = await window.biliDesk.bili.getUpVideos(
          targetMid,
          nextPage,
          nextOrder,
        );
        if (seq !== loadSeqRef.current) return;

        const list = result.videos ?? [];
        if (list.length > 0) {
          setVideos(list);
          setPage(result.page ?? nextPage);
          setTotal((prev) => Math.max(result.total ?? 0, prev));
          setHasMore(Boolean(result.hasMore));
          setVideosError("");
          scrollRef.current?.scrollTo({ top: 0 });
        } else {
          // 空成功不覆盖当前页，避免「有时有、有时暂无」
          setVideosError("本页投稿暂时无法获取，请稍后重试");
        }
      } catch (e) {
        if (seq !== loadSeqRef.current) return;
        // 翻页失败时保留当前页内容，避免整页被清空
        setVideosError(formatUserSpaceError(e));
      } finally {
        if (seq === loadSeqRef.current) setVideosLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!mid) return;

    let cancelled = false;
    loadSeqRef.current += 1;
    setProfileError("");
    setVideosError("");
    setVideosLoading(true);
    setProfile(null);
    setRelation(null);
    setVideos([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    setOrder("pubdate");
    setRelationPanel(null);

    void (async () => {
      try {
        const profilePromise = window.biliDesk.bili.getUpProfile(mid);
        const videosPromise = window.biliDesk.bili.getUpVideos(
          mid,
          1,
          "pubdate",
        );
        const relationPromise = window.biliDesk.bili
          .getUpRelation(mid)
          .catch(() => ({ isFollowing: false, attribute: 0 }) as UpRelation);

        const upProfile = await profilePromise;
        if (cancelled) return;
        setProfile(upProfile);
        setTotal(upProfile.videos || 0);

        void relationPromise.then((upRelation) => {
          if (!cancelled) setRelation(upRelation);
        });

        try {
          const result = await videosPromise;
          if (cancelled) return;
          const list = result.videos ?? [];
          setVideos(list);
          setPage(result.page ?? 1);
          // 列表为空时不要用资料页投稿数撑分页，否则会出现「暂无投稿 + 共 N 页」
          if (list.length > 0) {
            setTotal(Math.max(result.total ?? 0, upProfile.videos || 0));
            setHasMore(Boolean(result.hasMore));
            setVideosError("");
          } else if ((upProfile.videos || 0) > 0) {
            setTotal(upProfile.videos || 0);
            setHasMore(false);
            setVideosError("投稿列表暂时无法获取，请点击重新加载");
          } else {
            setTotal(0);
            setHasMore(false);
            setVideosError("");
          }
        } catch (videoErr) {
          if (cancelled) return;
          setVideos([]);
          setHasMore(false);
          setVideosError(formatUserSpaceError(videoErr));
        }
      } catch (e) {
        if (cancelled) return;
        setProfileError(formatUserSpaceError(e));
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mid]);

  const handleOrderChange = (nextOrder: UpVideosOrder) => {
    if (!mid || nextOrder === order || videosLoading) return;
    setOrder(nextOrder);
    void loadVideos(mid, 1, nextOrder);
  };

  const goToPage = (nextPage: number) => {
    if (!mid || videosLoading || nextPage < 1) return;
    if (nextPage > totalPages && !hasMore) return;
    void loadVideos(mid, nextPage, order);
  };

  const handleFollow = async () => {
    if (!relation) return;
    setLoadingFollow(true);
    try {
      await window.biliDesk.bili.modifyFollow(mid, !relation.isFollowing);
      setRelation({ ...relation, isFollowing: !relation.isFollowing });
    } catch (e) {
      setProfileError(formatUserSpaceError(e));
    } finally {
      setLoadingFollow(false);
    }
  };

  const openRelationList = useCallback((type: UserRelationListType) => {
    setRelationPanel(type);
  }, []);

  const closeRelationList = useCallback(() => {
    setRelationPanel(null);
  }, []);

  if (!mid) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        无效的 UP 主 ID
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-red-400">{profileError}</p>
        <p className="text-xs text-muted-foreground">
          可能是账号已注销、不存在，或暂时无法访问
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageBackHeader />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 p-6 pt-4">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card">
            {profile.topPhoto ? (
              <div className="relative h-36 w-full overflow-hidden sm:h-44">
                <BiliImage
                  src={profile.topPhoto}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
              </div>
            ) : null}

            <div className="relative space-y-4 p-6 pt-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <BiliImage
                  src={profile.face}
                  alt={profile.name}
                  className={cn(
                    "h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary/30",
                    profile.topPhoto && "-mt-12 h-24 w-24 border-4 border-card",
                  )}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold">{profile.name}</h1>
                    {profile.level != null && profile.level > 0 && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-semibold text-white",
                          profile.level >= 6
                            ? "bg-red-500"
                            : profile.level >= 4
                              ? "bg-orange-500"
                              : "bg-slate-400",
                        )}
                      >
                        Lv{profile.level}
                      </span>
                    )}
                    {profile.officialDesc && (
                      <span className="truncate text-sm text-primary">
                        {profile.officialDesc}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    UID {profile.mid}
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {profile.sign || "这个人很懒，什么都没有写~"}
                  </p>
                </div>

                <FollowButton
                  size="default"
                  isFollowing={relation?.isFollowing ?? false}
                  loading={loadingFollow}
                  disabled={!relation}
                  onClick={() => void handleFollow()}
                  className="shrink-0 self-start"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    {
                      label: "关注",
                      value: profile.following,
                      clickable: true as const,
                      type: "followings" as const,
                    },
                    {
                      label: "粉丝",
                      value: profile.fans,
                      clickable: true as const,
                      type: "followers" as const,
                    },
                    { label: "获赞", value: profile.likes ?? 0 },
                    { label: "播放", value: profile.archiveViews ?? 0 },
                    { label: "投稿", value: profile.videos },
                    { label: "收藏", value: profile.favourites ?? 0 },
                  ] as const
                ).map((item) => {
                  const clickable = "clickable" in item && item.clickable;
                  const content = (
                    <>
                      <div
                        className={cn(
                          "text-base font-semibold tabular-nums",
                          clickable && "text-primary",
                        )}
                      >
                        {formatCount(item.value)}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 text-xs",
                          clickable ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </div>
                    </>
                  );

                  if (clickable) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => openRelationList(item.type)}
                        className="rounded-xl bg-secondary/40 px-3 py-2.5 text-center transition-colors hover:bg-secondary/70"
                      >
                        {content}
                      </button>
                    );
                  }

                  return (
                    <div
                      key={item.label}
                      className="rounded-xl bg-secondary/40 px-3 py-2.5 text-center"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {profileError && (
            <p className="text-sm text-red-400">{profileError}</p>
          )}

          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium">投稿视频</h2>
              <div className="flex items-center gap-1.5">
                {ORDER_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={order === option.value ? "default" : "outline"}
                    disabled={videosLoading}
                    onClick={() => handleOrderChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {videosLoading && videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">加载投稿中...</p>
            ) : videosError && videos.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-red-400">{videosError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadVideos(mid, page, order)}
                >
                  重新加载
                </Button>
              </div>
            ) : videos.length > 0 ? (
              <div
                className={cn(
                  "grid gap-4",
                  GRID_COLS_CLASS[homeGridColumns],
                  videosLoading && "opacity-60",
                )}
              >
                {videos.map((video) => (
                  <VideoCard key={video.bvid} video={video} />
                ))}
              </div>
            ) : (profile.videos ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-red-400">
                  投稿列表暂时无法获取，请点击重新加载
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadVideos(mid, 1, order)}
                >
                  重新加载
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无投稿</p>
            )}

            {videosError && videos.length > 0 && (
              <p className="mt-3 text-sm text-red-400">{videosError}</p>
            )}
          </section>
        </div>
      </div>

      {videos.length > 0 && (totalPages > 1 || hasMore || page > 1) && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          disabled={videosLoading}
          disableNext={!hasMore && page >= totalPages}
          openEnded={total <= 0 && hasMore}
          onPageChange={goToPage}
          info={
            total > 0 ? (
              <>
                共 {total.toLocaleString()} 个投稿 · 第 {page} / {totalPages} 页
              </>
            ) : (
              <>
                第 {page} 页 · 本页 {videos.length} 个
              </>
            )
          }
        />
      )}

      {relationPanel && (
        <UpRelationListPanel
          mid={mid}
          type={relationPanel}
          ownerName={profile.name}
          onClose={closeRelationList}
          onPrivacyBlocked={showToast}
        />
      )}

      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed left-1/2 top-1/2 z-[10000] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/40 bg-black/85 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>,
          document.body,
        )}
    </div>
  );
}
