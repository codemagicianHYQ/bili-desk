import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Tv } from "lucide-react";
import type { SearchMediaItem, SearchMediaKind } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn, formatPubdate } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatError(err: unknown, kind: SearchMediaKind): string {
  const fallback = kind === "bangumi" ? "搜索番剧失败" : "搜索影视失败";
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface SearchMediaPanelProps {
  keyword: string;
  kind: SearchMediaKind;
  active: boolean;
  onTotalChange?: (total: number) => void;
}

export function SearchMediaPanel({
  keyword,
  kind,
  active,
  onTotalChange,
}: SearchMediaPanelProps) {
  const navigate = useNavigate();
  const loadSeqRef = useRef(0);
  const onTotalChangeRef = useRef(onTotalChange);
  onTotalChangeRef.current = onTotalChange;

  const [items, setItems] = useState<SearchMediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const label = kind === "bangumi" ? "番剧" : "影视";

  const load = useCallback(
    async (nextKeyword: string, nextPage: number) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;

      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError("");
      try {
        if (typeof window.biliDesk.bili.searchMedia !== "function") {
          throw new Error(`${label}搜索服务未就绪，请重启应用后再试`);
        }
        const result = await window.biliDesk.bili.searchMedia(
          trimmed,
          kind,
          nextPage,
        );
        if (seq !== loadSeqRef.current) return;
        setItems(result.items);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        onTotalChangeRef.current?.(result.total);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setItems([]);
        setTotal(0);
        setError(formatError(err, kind));
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [kind, label],
  );

  useEffect(() => {
    if (!active || !keyword.trim()) return;
    void load(keyword, 1);
  }, [active, keyword, kind, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (nextPage: number) => {
    if (loading || nextPage < 1) return;
    if (nextPage > totalPages && !hasMore) return;
    void load(keyword, nextPage);
  };

  if (!active) return null;

  return (
    <div>
      {loading && items.length === 0 ? (
        <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          搜索{label}中...
        </p>
      ) : error && items.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(keyword, page)}
          >
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          没有找到相关{label}
        </p>
      ) : (
        <>
          <div
            className={cn(
              "mx-auto grid max-w-5xl gap-4 px-6 py-4 md:grid-cols-2",
              loading && "opacity-60",
            )}
          >
            {items.map((item) => (
              <button
                key={`${item.kind}-${item.seasonId}-${item.mediaId}`}
                type="button"
                onClick={() => void openBiliHref(item.url, navigate)}
                className="group flex gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/40"
              >
                {item.cover ? (
                  <BiliImage
                    src={item.cover}
                    alt={item.title}
                    variant="cover"
                    className="h-28 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Tv className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {item.title}
                  </h3>
                  {(item.styles || item.areas) && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {[item.areas, item.styles].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {item.indexShow && (
                    <p className="mt-1 text-xs text-primary">
                      {item.indexShow}
                    </p>
                  )}
                  {item.desc && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.desc}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {item.score > 0 && (
                      <span>评分 {item.score.toFixed(1)}</span>
                    )}
                    {item.pubtime > 0 && (
                      <>
                        {item.score > 0 && <span>·</span>}
                        <span>{formatPubdate(item.pubtime)}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {items.length > 0 && (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              disabled={loading}
              disableNext={!hasMore && page >= totalPages}
              onPageChange={goToPage}
              info={
                <>
                  约 {total.toLocaleString()} 条 · 第 {page} / {totalPages} 页
                </>
              }
            />
          )}
        </>
      )}
    </div>
  );
}
