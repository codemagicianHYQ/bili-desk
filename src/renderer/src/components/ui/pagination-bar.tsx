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
  info?: ReactNode;
  onPageChange: (page: number) => void;
  className?: string;
}

export function PaginationBar({
  page,
  totalPages,
  disabled = false,
  disableNext,
  openEnded = false,
  maxJumpPage = 999,
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
