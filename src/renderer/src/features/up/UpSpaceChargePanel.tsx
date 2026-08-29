import { useEffect, useMemo, useState } from "react";
import type { UserCollectionItem } from "@shared/types";
import { UpSpaceCollectionsPanel } from "@/features/up/UpSpaceCollectionsPanel";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { Zap } from "lucide-react";

function looksLikeCharge(item: UserCollectionItem): boolean {
  return /充电|专属|upower/i.test(`${item.title} ${item.description}`);
}

export function UpSpaceChargePanel({
  mid,
  enabled,
}: {
  mid: number;
  enabled?: boolean;
}) {
  const [items, setItems] = useState<UserCollectionItem[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.biliDesk.bili
      .getUserCollections(mid, 1)
      .then((result) => {
        if (cancelled) return;
        setItems(
          [...result.seasons, ...result.series].filter(looksLikeCharge),
        );
      })
      .catch((err) => {
        if (!cancelled) setError(formatUserSpaceError(err));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mid]);

  const hasExclusive = useMemo(() => items.length > 0, [items.length]);

  if (!ready) {
    return <p className="text-sm text-muted-foreground">加载充电内容...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!hasExclusive) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-10 text-center">
        <Zap className="h-8 w-8 text-amber-400" />
        <p className="text-sm font-medium">
          {enabled ? "该 UP 已开通充电" : "暂无公开充电专属"}
        </p>
        <p className="text-xs text-muted-foreground">
          充电专属内容可能需要开通后才能查看，和官网空间一致。
        </p>
      </div>
    );
  }

  return <UpSpaceCollectionsPanel mid={mid} onlyCharge />;
}
