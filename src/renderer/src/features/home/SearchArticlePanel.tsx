import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchArticleItem, SearchArticleOrder } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatCount, formatPubdate } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const ARTICLE_PAGE_SIZE = 20;

const ORDER_OPTIONS: Array<{ value: SearchArticleOrder; label: string }> = [
  { value: "totalrank", label: "综合排序" },
  { value: "pubdate", label: "最新发布" },
  { value: "click", label: "最多阅读" },
  { value: "attention", label: "最多点赞" },
  { value: "scores", label: "最多评论" },
];

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : "搜索专栏失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface SearchArticlePanelProps {
  keyword: string;
  active: boolean;
  /** 用真实搜索总数校正 Tab 角标，避免综合统计与列表不一致 */
  onTotalChange?: (total: number) => void;
}

export function SearchArticlePanel({
  keyword,
  active,
  onTotalChange,
}: SearchArticlePanelProps) {
  const loadSeqRef = useRef(0);
  const onTotalChangeRef = useRef(onTotalChange);
  onTotalChangeRef.current = onTotalChange;

  const [order, setOrder] = useState<SearchArticleOrder>("totalrank");
  const [articles, setArticles] = useState<SearchArticleItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (
      nextKeyword: string,
      nextPage: number,
      nextOrder: SearchArticleOrder,
    ) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;

      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError("");
      try {
        if (typeof window.biliDesk.bili.searchArticles !== "function") {
          throw new Error("专栏搜索服务未就绪，请重启应用后再试");
        }
        const result = await window.biliDesk.bili.searchArticles(
          trimmed,
          nextPage,
          nextOrder,
        );
        if (seq !== loadSeqRef.current) return;
        setArticles(result.articles);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        // 仅成功时校正角标，避免失败/重试把角标打成 0 来回跳
        onTotalChangeRef.current?.(result.total);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setArticles([]);
        setTotal(0);
        setError(formatError(err));
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!active || !keyword.trim()) return;
    void load(keyword, 1, order);
  }, [active, keyword, order, load]);

  const totalPages = Math.max(1, Math.ceil(total / ARTICLE_PAGE_SIZE));

  const goToPage = (nextPage: number) => {
    if (loading || nextPage < 1) return;
    if (nextPage > totalPages && !hasMore) return;
    void load(keyword, nextPage, order);
  };

  if (!active) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
        {ORDER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setOrder(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              order === option.value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && articles.length === 0 ? (
        <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          搜索专栏中...
        </p>
      ) : error && articles.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(keyword, page, order)}
          >
            重试
          </Button>
        </div>
      ) : articles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          没有找到相关专栏
        </p>
      ) : (
        <>
          <div
            className={cn(
              "mx-auto grid max-w-5xl gap-4 px-6 py-4 md:grid-cols-2",
              loading && "opacity-60",
            )}
          >
            {articles.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/40"
              >
                {article.cover ? (
                  <BiliImage
                    src={article.cover}
                    alt={article.title}
                    variant="cover"
                    className="h-20 w-28 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-20 w-28 shrink-0 rounded-lg bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {article.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {article.desc || "暂无摘要"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {article.author ||
                        (article.mid > 0 ? `UID ${article.mid}` : "未知作者")}
                    </span>
                    {article.categoryName && (
                      <>
                        <span>·</span>
                        <span>{article.categoryName}</span>
                      </>
                    )}
                    {article.pubTime > 0 && (
                      <>
                        <span>·</span>
                        <span>{formatPubdate(article.pubTime)}</span>
                      </>
                    )}
                    <span className="ml-auto">
                      {formatCount(article.view)} 阅读 ·{" "}
                      {formatCount(article.like)} 赞
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            disabled={loading}
            disableNext={!hasMore && page >= totalPages}
            onPageChange={goToPage}
            info={
              <>
                约 {total.toLocaleString()} 篇专栏 · 第 {page} / {totalPages} 页
              </>
            }
          />
        </>
      )}
    </div>
  );
}
