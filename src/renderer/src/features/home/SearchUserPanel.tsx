import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SearchUserItem,
  SearchUserOrder,
  SearchUserTypeFilter,
} from "@shared/types";
import { SearchUserCard } from "@/components/search/SearchUserCard";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFollowedMidSet } from "@/lib/use-followed-mids";
import { Loader2 } from "lucide-react";

const USER_PAGE_SIZE = 20;

const ORDER_OPTIONS: Array<{ value: SearchUserOrder; label: string }> = [
  { value: "default", label: "默认排序" },
  { value: "fans_desc", label: "粉丝数由高到低" },
  { value: "fans_asc", label: "粉丝数由低到高" },
  { value: "level_desc", label: "Lv等级由高到低" },
  { value: "level_asc", label: "Lv等级由低到高" },
];

const USER_TYPE_OPTIONS: Array<{
  value: SearchUserTypeFilter;
  label: string;
}> = [
  { value: 0, label: "全部用户" },
  { value: 1, label: "UP主用户" },
  { value: 2, label: "普通用户" },
  { value: 3, label: "认证用户" },
];

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : "搜索用户失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface SearchUserPanelProps {
  keyword: string;
  active: boolean;
}

export function SearchUserPanel({ keyword, active }: SearchUserPanelProps) {
  const followedMidSet = useFollowedMidSet();
  const loadSeqRef = useRef(0);
  const [order, setOrder] = useState<SearchUserOrder>("default");
  const [userType, setUserType] = useState<SearchUserTypeFilter>(0);
  const [users, setUsers] = useState<SearchUserItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (
      nextKeyword: string,
      nextPage: number,
      nextOrder: SearchUserOrder,
      nextType: SearchUserTypeFilter,
    ) => {
      const trimmed = nextKeyword.trim();
      if (!trimmed) return;

      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError("");
      try {
        const result = await window.biliDesk.bili.searchUsers(
          trimmed,
          nextPage,
          nextOrder,
          nextType,
        );
        if (seq !== loadSeqRef.current) return;
        setUsers(result.users);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setUsers([]);
        setError(formatError(err));
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!active || !keyword.trim()) return;
    void load(keyword, 1, order, userType);
  }, [active, keyword, order, userType, load]);

  const totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));

  const goToPage = (nextPage: number) => {
    if (loading || nextPage < 1) return;
    if (nextPage > totalPages && !hasMore) return;
    void load(keyword, nextPage, order, userType);
  };

  if (!active) return null;

  return (
    <div>
      <div className="space-y-2 border-b border-border px-6 py-3">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
          {USER_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setUserType(option.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                userType === option.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && users.length === 0 ? (
        <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          搜索用户中...
        </p>
      ) : error && users.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(keyword, page, order, userType)}
          >
            重试
          </Button>
        </div>
      ) : users.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          没有找到相关用户
        </p>
      ) : (
        <>
          <div
            className={cn(
              "mx-auto grid max-w-5xl gap-x-8 gap-y-1 px-6 py-4 md:grid-cols-2",
              loading && "opacity-60",
            )}
          >
            {users.map((user) => (
              <SearchUserCard
                key={user.mid}
                user={user}
                followed={followedMidSet.has(user.mid)}
              />
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
                约 {total.toLocaleString()} 位用户 · 第 {page} / {totalPages} 页
              </>
            }
          />
        </>
      )}
    </div>
  );
}
