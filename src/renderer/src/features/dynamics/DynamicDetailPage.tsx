import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SpaceDynamicItem } from "@shared/types";
import { DynamicCommentSection } from "@/features/dynamics/DynamicCommentSection";
import { BiliImage } from "@/components/ui/bili-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { cn, formatCount } from "@/lib/utils";
import { Loader2, MessageCircle, Share2, ThumbsUp } from "lucide-react";

function formatPubTime(ts: number, label?: string): string {
  if (label) return label;
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}年${m}月${d}日 ${hh}:${mm}`;
}

export function DynamicDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [item, setItem] = useState<SpaceDynamicItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [tip, setTip] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setItem(null);
    void window.biliDesk.bili
      .getDynamicDetail(id)
      .then((detail) => {
        if (cancelled) return;
        setItem(detail);
        setLiked(Boolean(detail.liked));
        setLikeCount(detail.stats?.like ?? 0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载动态失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const images = useMemo(() => {
    if (!item) return [];
    if (item.images?.length) return item.images;
    if (item.cover) return [item.cover];
    return [];
  }, [item]);

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const handleLike = async () => {
    if (!item || liking) return;
    const next = !liked;
    setLiking(true);
    try {
      await window.biliDesk.bili.likeDynamic(item.id, next);
      setLiked(next);
      setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
    } catch (err) {
      showTip(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleShare = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(
        `https://www.bilibili.com/opus/${item.id}`,
      );
      showTip("链接已复制");
    } catch {
      showTip("复制失败");
    }
  };

  const commentOid = item?.commentId || item?.id || "";
  const commentType = item?.commentType || 17;

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/dynamics" label="返回动态" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载动态中...
          </div>
        ) : error ? (
          <p className="px-6 py-16 text-center text-sm text-red-400">{error}</p>
        ) : !item ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            动态不存在
          </p>
        ) : (
          <div className="mx-auto flex max-w-3xl gap-6 px-6 py-6">
            <div className="min-w-0 flex-1 space-y-5">
              {images[0] && (
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-xl bg-secondary/30"
                  onClick={() => setPreviewIndex(0)}
                >
                  <BiliImage
                    src={images[0]}
                    alt={item.title || ""}
                    className="max-h-[520px] w-full object-contain"
                  />
                </button>
              )}

              {item.title && (
                <h1 className="text-2xl font-semibold leading-snug">
                  {item.title}
                </h1>
              )}

              <div className="flex items-center gap-3">
                {item.authorFace ? (
                  <BiliImage
                    src={item.authorFace}
                    alt={item.authorName || ""}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-secondary" />
                )}
                <div className="min-w-0">
                  {item.authorMid ? (
                    <Link
                      to={`/up/${item.authorMid}`}
                      className="truncate text-[15px] font-medium text-sky-400 hover:underline"
                    >
                      {item.authorName || "用户"}
                    </Link>
                  ) : (
                    <p className="truncate text-[15px] font-medium">
                      {item.authorName || "用户"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatPubTime(item.pubTime, item.pubTimeLabel)}
                    {item.pubAction ? ` · ${item.pubAction}` : ""}
                  </p>
                </div>
              </div>

              {item.text && (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {item.text}
                </p>
              )}

              {images.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.slice(1).map((src, index) => (
                    <button
                      key={`${src}-${index}`}
                      type="button"
                      onClick={() => setPreviewIndex(index + 1)}
                      className="overflow-hidden rounded-lg"
                    >
                      <BiliImage
                        src={src}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-5">
                <DynamicCommentSection
                  oid={commentOid}
                  type={commentType}
                  replyCount={item.stats?.reply ?? 0}
                />
              </div>
            </div>

            <aside className="sticky top-4 hidden h-fit w-14 shrink-0 flex-col items-center gap-4 self-start rounded-full border border-border/70 bg-card/90 px-2 py-4 shadow-sm lg:flex">
              {tip && (
                <span className="absolute -left-24 top-2 rounded-full bg-black/80 px-2 py-1 text-[11px] text-white">
                  {tip}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleLike()}
                disabled={liking}
                className={cn(
                  "flex flex-col items-center gap-1 text-xs transition-colors",
                  liked
                    ? "text-pink-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
                  <ThumbsUp
                    className={cn("h-4 w-4", liked && "fill-current")}
                  />
                </span>
                {formatCount(likeCount)}
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
                  <Share2 className="h-4 w-4" />
                </span>
                {formatCount(item.stats?.forward ?? 0)}
              </button>
              <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
                  <MessageCircle className="h-4 w-4" />
                </span>
                {formatCount(item.stats?.reply ?? 0)}
              </div>
            </aside>
          </div>
        )}
      </div>

      {item && (
        <ImageLightbox
          images={images}
          index={previewIndex ?? 0}
          open={previewIndex != null}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      )}
    </div>
  );
}
