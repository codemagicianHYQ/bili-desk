import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BlacklistUser } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatPubdate } from "@/lib/utils";
import { Ban, Loader2, UserCheck } from "lucide-react";

export function BlacklistPanel() {
  const [users, setUsers] = useState<BlacklistUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<BlacklistUser | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  const [message, setMessage] = useState("");

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }

    try {
      const result = await window.biliDesk.bili.getBlacklist(nextPage);
      setUsers((prev) => (append ? [...prev, ...result.users] : result.users));
      setPage(result.page);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "黑名单加载失败");
      if (!append) setUsers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  const handleUnblock = async () => {
    const up = target;
    if (!up) return;

    setUnblocking(true);
    try {
      await window.biliDesk.bili.modifyBlock(up.mid, false);
      setUsers((prev) => prev.filter((item) => item.mid !== up.mid));
      setTotal((prev) => Math.max(0, prev - 1));
      setMessage(`已将「${up.uname}」移出黑名单`);
      setTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消拉黑失败");
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        与 B 站账号同步。取消拉黑后可重新关注，不会自动加回关注列表。
      </p>

      {(error || message) && (
        <p className={`text-xs ${error ? "text-red-400" : "text-foreground"}`}>
          {error || message}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载黑名单...
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <Ban className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">黑名单是空的</p>
          <p className="mt-1 text-xs text-muted-foreground">
            被拉黑的用户会出现在这里
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">共 {total} 人</p>
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.mid}
                className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3"
              >
                <Link to={`/up/${user.mid}`} className="shrink-0">
                  <BiliImage
                    src={user.face}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/up/${user.mid}`}
                    className="truncate text-sm font-medium hover:text-primary"
                  >
                    {user.uname}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.sign || "暂无签名"}
                  </p>
                  {user.blockedAt ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      拉黑于 {formatPubdate(user.blockedAt)}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1"
                  onClick={() => {
                    setError("");
                    setTarget(user);
                  }}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  取消拉黑
                </Button>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={loadingMore}
                onClick={() => void loadPage(page + 1, true)}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中...
                  </>
                ) : (
                  "加载更多"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={target != null}
        title="取消拉黑"
        description={
          target
            ? `确定将「${target.uname}」移出黑名单吗？之后可以重新关注。`
            : undefined
        }
        confirmLabel="取消拉黑"
        cancelLabel="先留着"
        loading={unblocking}
        onConfirm={() => void handleUnblock()}
        onCancel={() => {
          if (!unblocking) setTarget(null);
        }}
      />
    </div>
  );
}
