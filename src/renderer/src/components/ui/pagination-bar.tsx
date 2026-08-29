import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  disabled?: boolean;
  disableNext?: boolean;
  /**
   * 游标分页等「总页数未知」场景：
   * - 下一页只看 disableNext
   * - 允许跳转到大于当前已知页数的页码（由业务侧按需拉取）
   */
  openEnded?: boolean;
  /** openEnded 时跳转上限，默认 999 */
  maxJumpPage?: number;
  /** pages：官网页码条（1 2 3 … N + 跳至） */
  variant?: "bar" | "pages";
  /** variant=pages 时「共 x 页 / y 个」里的 y */
  totalCount?: number;
  info?: ReactNode;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageToken = number | "ellipsis";

function range(from: number, to: number): number[] {
  const list: number[] = [];
  for (let i = from; i <= to; i += 1) list.push(i);
  return list;
}

/** 对齐 B 站空间投稿：首页 1–7 … 末页；中间当前页两侧各 2 个 */
function buildPageTokens(current: number, total: number): PageToken[] {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 9) return range(1, total);
  if (current <= 4) return [...range(1, 7), "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", ...range(total - 6, total)];
  return [1, "ellipsis", ...range(current - 2, current + 2), "ellipsis", total];
}

export function PaginationBar({
  page,
  totalPages,
  disabled = false,
  disableNext,
  openEnded = false,
  maxJumpPage = 999,
  variant = "bar",
  totalCount,
  info,
  onPageChange,
  className,
}: PaginationBarProps) {
  const [jumpPageInput, setJumpPageInput] = useState(String(page));

  useEffect(() => {
    setJumpPageInput(String(page));
  }, [page]);

  const jumpUpperBound = openEnded ? maxJumpPage : Math.max(1, totalPages);

  const handleJump = useCallback(() => {
    const target = Number.parseInt(jumpPageInput, 10);
    if (!Number.isFinite(target)) return;
    if (target < 1 || target > jumpUpperBound) return;
    if (target === page) return;
    onPageChange(target);
  }, [jumpPageInput, jumpUpperBound, page, onPageChange]);

  if (totalPages <= 0 && !openEnded) return null;
  if (openEnded && page < 1) return null;

  const canPrev = !disabled && page > 1;
  const canNext =
    !disabled && !Boolean(disableNext) && (openEnded || page < totalPages);

  if (variant === "pages") {
    const tokens = openEnded
      ? [page]
      : buildPageTokens(page, Math.max(totalPages, page));
    const countText =
      typeof totalCount === "number" && totalCount > 0
        ? `共 ${Math.max(totalPages, page)} 页 / ${totalCount.toLocaleString()} 个，跳至`
        : `共 ${Math.max(totalPages, page)} 页，跳至`;

    return (
      <div className={cn("border-t border-border px-6 py-3", className)}>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <button
              type="button"
              disabled={!canPrev}
              className={pageBtnClass(false)}
              onClick={() => onPageChange(page - 1)}
            >
              上一页
            </button>
          )}
          {tokens.map((token, index) =>
            token === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="flex h-8 min-w-8 items-center justify-center rounded-md bg-secondary text-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <button
                key={token}
                type="button"
                disabled={disabled}
                aria-current={token === page ? "page" : undefined}
                className={pageBtnClass(token === page)}
                onClick={() => token !== page && onPageChange(token)}
              >
                {token}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={!canNext}
            className={cn(pageBtnClass(false), "min-w-16 px-3")}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </button>
          <form
            className="ml-auto flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
            onSubmit={(event) => {
              event.preventDefault();
              handleJump();
            }}
          >
            <span>{countText}</span>
            <input
              type="number"
              min={1}
              max={jumpUpperBound}
              value={jumpPageInput}
              onChange={(event) => setJumpPageInput(event.target.value)}
              disabled={disabled}
              className="h-8 w-12 rounded-md border border-border bg-secondary/40 px-1 text-center text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              aria-label="跳至页码"
            />
            <span>页</span>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border px-6 py-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {info ? (
          <div className="text-xs text-muted-foreground">{info}</div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {openEnded && disableNext !== false && page >= totalPages
              ? `第 ${page} 页`
              : `第 ${page} / ${Math.max(totalPages, page)} 页`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(1)}
          >
            首页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={
              disabled ||
              Boolean(disableNext) ||
              (!openEnded && page >= totalPages)
            }
            onClick={() => onPageChange(page + 1)}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              handleJump();
            }}
          >
            <input
              type="number"
              min={1}
              max={jumpUpperBound}
              value={jumpPageInput}
              onChange={(event) => setJumpPageInput(event.target.value)}
              disabled={disabled}
              className="h-8 w-14 rounded-md border border-border bg-secondary/30 px-2 text-center text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              aria-label="跳转页码"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={disabled}
            >
              跳转
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function pageBtnClass(active: boolean): string {
  return cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-secondary text-foreground hover:bg-secondary/70",
  );
}
