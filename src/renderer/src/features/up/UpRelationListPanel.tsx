import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { FollowingUp, UserRelationListType } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/video/FollowButton";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";

interface UpRelationListPanelProps {
  mid: number;
  type: UserRelationListType;
  ownerName: string;
  onClose: () => void;
  onPrivacyBlocked: (message: string) => void;
}

function formatListError(err: unknown): string {
  return extractIpcErrorMessage(err) || "列表加载失败";
}

export function UpRelationListPanel({
  mid,
  type,
  ownerName,
  onClose,
  onPrivacyBlocked,
}: UpRelationListPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadSeqRef = useRef(0);
  const [users, setUsers] = useState<FollowingUp[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [followPendingMid, setFollowPendingMid] = useState<number | null>(null);

  const title =
    type === "followers" ? `${ownerName} 的粉丝` : `${ownerName} 的关注`;

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const seq = ++loadSeqRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        const result = await window.biliDesk.bili.getUserRelationList(
          mid,
          type,
          nextPage,
        );
        if (seq !== loadSeqRef.current) return;

        setUsers((prev) =>
          append ? [...prev, ...result.users] : result.users,
        );
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setError("");
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        const message = formatListError(err);
        if (message.includes("隐私")) {
          onPrivacyBlocked(message);
          onClose();
          return;
        }
        setError(message);
        if (!append) setUsers([]);
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [mid, type, onClose, onPrivacyBlocked],
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      void loadPage(page + 1, true);
    }
  };

  const handleFollowToggle = async (user: FollowingUp) => {
    const nextFollow = !(user.isFollowing || user.mutual);
    setFollowPendingMid(user.mid);
    try {
      await window.biliDesk.bili.modifyFollow(user.mid, nextFollow);
      setUsers((prev) =>
        prev.map((item) =>
          item.mid === user.mid
            ? {
                ...item,
                isFollowing: nextFollow,
                mutual: nextFollow ? item.mutual : false,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(formatListError(err));
    } finally {
      setFollowPendingMid(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {total > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                共 {total.toLocaleString()} 人
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          onScroll={handleScroll}
        >
          {loading && users.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              加载中...
            </p>
          ) : error && users.length === 0 ? (
            <div className="space-y-3 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadPage(1, false)}
              >
                重新加载
              </Button>
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              暂无数据
            </p>
          ) : (
            <ul className="space-y-2">
              {users.map((user) => (
                <li
                  key={user.mid}
                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/20 px-3 py-3"
                >
                  <Link
                    to={`/up/${user.mid}`}
                    className="shrink-0"
                    onClick={onClose}
                  >
                    <BiliImage
                      src={user.face}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/up/${user.mid}`}
                      className="truncate font-medium hover:text-primary"
                      onClick={onClose}
                    >
                      {user.uname}
                    </Link>
                    {user.official?.title ? (
                      <p className="mt-0.5 truncate text-xs text-primary">
                        {user.official.title}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {user.sign || "暂无签名"}
                    </p>
                  </div>
                  <FollowButton
                    size="sm"
                    isFollowing={Boolean(user.isFollowing || user.mutual)}
                    loading={followPendingMid === user.mid}
                    onClick={() => void handleFollowToggle(user)}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          )}

          {loadingMore && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              加载更多...
            </p>
          )}
          {!hasMore && users.length > 0 && !loadingMore && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              已经到底啦
            </p>
          )}
          {error && users.length > 0 && (
            <p className={cn("py-2 text-center text-xs text-red-400")}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
