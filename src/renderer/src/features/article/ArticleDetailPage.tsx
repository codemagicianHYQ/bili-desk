import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ArticleDetail } from "@shared/types";
import { DynamicCommentSection } from "@/features/dynamics/DynamicCommentSection";
import { BiliImage } from "@/components/ui/bili-image";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";
import { cn, formatCount, formatPubdate } from "@/lib/utils";
import {
  isBiliShortUrl,
  isBiliUrl,
  parseBiliAppPath,
} from "@shared/utils/bili-app-link";
import { Loader2, MessageCircle, Share2, ThumbsUp } from "lucide-react";

const ARTICLE_COMMENT_TYPE = 12;

function formatPubTime(ts: number): string {
  if (!ts) return "";
  return formatPubdate(ts);
}

export function ArticleDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cvid = Number(id);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [tip, setTip] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setArticle(null);

    if (!Number.isFinite(cvid) || cvid <= 0) {
      setError("专栏 ID 无效");
      setLoading(false);
      return;
    }
    if (typeof window.biliDesk.bili.getArticle !== "function") {
      setError("专栏服务未就绪，请完全重启应用后再试");
      setLoading(false);
      return;
    }

    void window.biliDesk.bili
      .getArticle(cvid)
      .then((detail) => {
        if (cancelled) return;
        if (!detail.content?.trim() && detail.dynId) {
          navigate(`/dynamic/${detail.dynId}`, { replace: true });
          return;
        }
        setArticle(detail);
        setLiked(Boolean(detail.liked));
        setLikeCount(detail.like);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载专栏失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cvid, navigate]);

  const html = useMemo(
    () => (article?.content ? sanitizeArticleHtml(article.content) : ""),
    [article?.content],
  );

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const handleLike = async () => {
    if (!article || liking) return;
    const next = !liked;
    setLiking(true);
    try {
      await window.biliDesk.bili.likeArticle(article.id, next);
      setLiked(next);
      setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
    } catch (err) {
      showTip(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleShare = async () => {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(
        `https://www.bilibili.com/read/cv${article.id}`,
      );
      showTip("链接已复制");
    } catch {
      showTip("复制失败");
    }
  };

  const handleContentClick = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();

    const direct = parseBiliAppPath(href);
    if (direct) {
      navigate(direct);
      return;
    }
    if (isBiliShortUrl(href)) {
      try {
        const resolved = await window.biliDesk.app.resolveBiliUrl(href);
        const appPath = parseBiliAppPath(resolved);
        if (appPath) {
          navigate(appPath);
          return;
        }
      } catch {
        showTip("链接解析失败");
        return;
      }
    }
    if (isBiliUrl(href) || isBiliShortUrl(href)) {
      showTip("应用内暂不支持该页面");
      return;
    }
    void window.biliDesk.app.openExternal(href);
  };

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/" label="返回" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载专栏中...
          </div>
        ) : error ? (
          <p className="px-6 py-16 text-center text-sm text-red-400">{error}</p>
        ) : !article ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            专栏不存在
          </p>
        ) : (
          <div className="mx-auto flex max-w-3xl gap-6 px-6 py-6">
            <div className="min-w-0 flex-1 space-y-5">
              {article.banner && (
                <BiliImage
                  src={article.banner}
                  alt=""
                  className="max-h-[360px] w-full rounded-xl object-cover"
                />
              )}

              <h1 className="text-2xl font-semibold leading-snug">
                {article.title}
              </h1>

              <div className="flex items-center gap-3">
                {article.authorFace ? (
                  <BiliImage
                    src={article.authorFace}
                    alt={article.author}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-secondary" />
                )}
                <div className="min-w-0">
                  {article.mid ? (
                    <Link
                      to={`/up/${article.mid}`}
                      className="truncate text-[15px] font-medium text-sky-400 hover:underline"
                    >
                      {article.author || "用户"}
                    </Link>
                  ) : (
                    <p className="truncate text-[15px] font-medium">
                      {article.author || "用户"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatPubTime(article.pubTime)}
                    {article.categoryName ? ` · ${article.categoryName}` : ""}
                    {article.words > 0
                      ? ` · ${article.words.toLocaleString()} 字`
                      : ""}
                    {article.view > 0
                      ? ` · ${formatCount(article.view)} 阅读`
                      : ""}
                  </p>
                </div>
              </div>

              {html ? (
                <div
                  className="article-body"
                  onClick={(event) => void handleContentClick(event)}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
                  {article.summary || "这篇专栏没有正文内容"}
                </p>
              )}

              <div className="border-t border-border pt-5">
                <DynamicCommentSection
                  oid={String(article.id)}
                  type={ARTICLE_COMMENT_TYPE}
                  replyCount={article.reply}
                  ownerMid={article.mid}
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
                {formatCount(article.share)}
              </button>
              <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
                  <MessageCircle className="h-4 w-4" />
                </span>
                {formatCount(article.reply)}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
