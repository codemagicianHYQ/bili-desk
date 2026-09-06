import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Radio } from "lucide-react";
import type { SearchLiveItem, SearchLiveOrder } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatCount } from "@/lib/utils";

const PAGE_SIZE = 30;

const ORDER_OPTIONS: Array<{ value: SearchLiveOrder; label: string }> = [
  { value: "online", label: "人气直播" },
  { value: "live_time", label: "最新开播" },
];

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : "搜索直播失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface SearchLivePanelProps {
  keyword: string;
  active: boolean;
  onTotalChange?: (total: number) => void;
}

export function SearchLivePanel({
  keyword,
  active,
  onTotalChange,
}: SearchLivePanelProps) {
  const loadSeqRef = useRef(0);
  const onTotalChangeRef = useRef(onTotalChange);
  onTotalChangeRef.current = onTotalChange;

  const [order, setOrder] = useState<SearchLiveOrder>("online");
  const [rooms, setRooms] = useState<SearchLiveItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (
      nextKeyword: string,
      nextPage: number,
      nextOrder: SearchLiveOrder,
    ) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;

      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError("");
      try {
        if (typeof window.biliDesk.bili.searchLiveRooms !== "function") {
          throw new Error("直播搜索服务未就绪，请重启应用后再试");
        }
        const result = await window.biliDesk.bili.searchLiveRooms(
          trimmed,
          nextPage,
          nextOrder,
        );
        if (seq !== loadSeqRef.current) return;
        setRooms(result.rooms);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        onTotalChangeRef.current?.(result.total);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setRooms([]);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      {loading && rooms.length === 0 ? (
        <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          搜索直播中...
        </p>
      ) : error && rooms.length === 0 ? (
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
      ) : rooms.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          没有找到相关直播
        </p>
      ) : (
        <>
          <div
            className={cn(
              "grid grid-cols-2 gap-4 p-6 md:grid-cols-3 xl:grid-cols-4",
              loading && "opacity-60",
            )}
          >
            {rooms.map((room) => (
              <Link
                key={room.roomId}
                to={`/live/${room.roomId}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-secondary/40"
              >
                <div className="relative aspect-video bg-muted">
                  <BiliImage
                    src={room.cover || room.face}
                    alt={room.title}
                    variant="cover"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <span className="absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Radio className="h-3 w-3" />
                    直播
                  </span>
                  {room.areaName && (
                    <span className="absolute bottom-2 left-2 z-[1] max-w-[60%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {room.areaName}
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    {room.online > 0
                      ? `${formatCount(room.online)} 人气`
                      : "直播中"}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
                    {room.title}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {room.uname || "未知主播"}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {rooms.length > 0 && (
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
