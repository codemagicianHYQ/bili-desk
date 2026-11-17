import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import type { CheeseCourseItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { formatDisplayedError } from "@/lib/ipc-error";
import { openBiliHref } from "@/lib/open-bili-href";
import { formatCount } from "@/lib/utils";

export function UpSpaceCoursePanel({ mid }: { mid: number }) {
  const [items, setItems] = useState<CheeseCourseItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const result = await window.biliDesk.bili.getUpCourses(mid, nextPage);
        const list = result.list ?? [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(result.page ?? nextPage);
        setHasMore(Boolean(result.hasMore));
      } catch (err) {
        setError(formatDisplayedError(err, undefined, "课堂加载失败"));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  if (loading && items.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载课堂...
      </p>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load(1, false)}
        >
          重新加载
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无课程</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CourseRow key={item.seasonId} item={item} />
      ))}
      {hasMore ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loadingMore}
          onClick={() => void load(page + 1, true)}
        >
          {loadingMore ? "加载中..." : "加载更多"}
        </Button>
      ) : null}
    </div>
  );
}

function CourseRow({ item }: { item: CheeseCourseItem }) {
  const navigate = useNavigate();
  const meta = [
    item.epCount > 0 ? `${item.epCount} 课时` : "",
    item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
    item.subtitle,
    item.status,
  ]
    .filter(Boolean)
    .join(" · ");
  const className =
    "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50";
  const body = (
    <>
      {item.cover ? (
        <BiliImage
          src={item.cover}
          alt=""
          className="h-20 w-32 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-muted">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        {meta ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {meta}
          </p>
        ) : null}
      </div>
    </>
  );

  if (item.kind === "cheese" && item.seasonId > 0) {
    return (
      <Link to={`/season/cheese/${item.seasonId}`} className={className}>
        {body}
      </Link>
    );
  }

  if (item.url) {
    return (
      <button
        type="button"
        className={`${className} w-full text-left`}
        onClick={() => void openBiliHref(item.url, navigate)}
      >
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
