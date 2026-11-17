import { useEffect, useState, type ReactNode } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const resolved = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const pending = new Map<string, (value: string) => void>();
let flushTimer: number | null = null;

function scheduleChargeBadgeFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    const ids = [...pending.keys()].slice(0, 24);
    if (ids.length === 0) return;
    const jobs = ids.map((id) => {
      const resolve = pending.get(id)!;
      pending.delete(id);
      return { id, resolve };
    });
    if (pending.size > 0) scheduleChargeBadgeFlush();
    void window.biliDesk.bili
      .lookupChargeBadges(ids)
      .then((map) => {
        for (const job of jobs) {
          if (!(job.id in map)) {
            inflight.delete(job.id);
            job.resolve("");
            continue;
          }
          resolved.set(job.id, map[job.id] ?? "");
          job.resolve(map[job.id] ?? "");
        }
      })
      .catch(() => {
        for (const job of jobs) {
          inflight.delete(job.id);
          job.resolve("");
        }
      });
  }, 40);
}

function requestChargeBadge(bvid: string): Promise<string> {
  const cached = resolved.get(bvid);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = inflight.get(bvid);
  if (existing) return existing;
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((res) => {
    resolve = res;
  });
  inflight.set(bvid, promise);
  pending.set(bvid, resolve);
  scheduleChargeBadgeFlush();
  return promise;
}

/** known 有值时不再请求。列表没标时按 bvid 查稿件详情 */
export function useCoverChargeBadge(bvid?: string, known?: string): string {
  const [badge, setBadge] = useState(known ?? "");

  useEffect(() => {
    if (known) {
      setBadge(known);
      return;
    }
    const id = bvid?.trim();
    if (!id) {
      setBadge("");
      return;
    }
    let cancel = false;
    setBadge("");
    void requestChargeBadge(id).then((value) => {
      if (!cancel) setBadge(value);
    });
    return () => {
      cancel = true;
    };
  }, [bvid, known]);

  return known || badge;
}

export function ChargeCoverBadge({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "absolute right-2 top-2 z-[2] inline-flex items-center gap-0.5 rounded bg-[#00aeec] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-white",
        className,
      )}
    >
      <Zap className="h-3 w-3 fill-current" />
      {label}
    </span>
  );
}

export function ChargeMarkedCover({
  bvid,
  known,
  className,
  badgeClassName,
  children,
}: {
  bvid?: string;
  known?: string;
  className?: string;
  badgeClassName?: string;
  children: ReactNode;
}) {
  const label = useCoverChargeBadge(bvid, known);
  return (
    <div className={cn("relative", className)}>
      {children}
      <ChargeCoverBadge label={label} className={badgeClassName} />
    </div>
  );
}
