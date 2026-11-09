import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  FollowingUp,
  UpAssignmentPath,
  UpGroupSelection,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

export interface FollowingSearchHit {
  up: FollowingUp;
  localPath: string | null;
  localSelection: UpGroupSelection | null;
  biliTags: string[];
}

interface FollowingSearchProps {
  followings: FollowingUp[] | null;
  assignments: UpAssignmentPath[];
  biliTagByMid: Map<number, string[]>;
  loading?: boolean;
  onPickLocal: (selection: UpGroupSelection, mid: number) => void;
  className?: string;
}

function scoreMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const index = n.indexOf(q);
  if (index >= 0) return 60 - Math.min(index, 20);
  return 0;
}

export function FollowingSearch({
  followings,
  assignments,
  biliTagByMid,
  loading = false,
  onPickLocal,
  className,
}: FollowingSearchProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const assignmentByMid = useMemo(() => {
    const map = new Map<number, UpAssignmentPath>();
    for (const item of assignments) map.set(item.mid, item);
    return map;
  }, [assignments]);

  const hits = useMemo(() => {
    const q = query.trim();
    if (!q || !followings) return [] as FollowingSearchHit[];
    const midQuery = /^\d+$/.test(q) ? Number(q) : null;
    const ranked: Array<FollowingSearchHit & { score: number }> = [];
    for (const up of followings) {
      let score = scoreMatch(up.uname, q);
      if (midQuery != null && up.mid === midQuery) score = Math.max(score, 95);
      else if (String(up.mid).includes(q)) score = Math.max(score, 40);
      if (score <= 0) continue;
      const assignment = assignmentByMid.get(up.mid);
      const biliTags = [...(biliTagByMid.get(up.mid) ?? [])];
      if (up.special && !biliTags.includes("特别关注")) {
        biliTags.unshift("特别关注");
      }
      ranked.push({
        up,
        score,
        localPath: assignment ? `${assignment.l1} / ${assignment.l2}` : null,
        localSelection: assignment
          ? { level: "l2", id: assignment.l2Id }
          : { level: "uncategorized", id: null },
        biliTags,
      });
    }
    ranked.sort(
      (a, b) =>
        b.score - a.score || a.up.uname.localeCompare(b.up.uname, "zh-CN"),
    );
    return ranked.slice(0, 12);
  }, [assignmentByMid, biliTagByMid, followings, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [open, query, hits.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById("following-search-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (hit: FollowingSearchHit) => {
    setQuery(hit.up.uname);
    setOpen(false);
    if (hit.localSelection) onPickLocal(hit.localSelection, hit.up.mid);
    else navigate(`/up/${hit.up.mid}`);
  };

  const showMenu = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <div className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background/70 px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!showMenu) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) =>
                hits.length === 0 ? 0 : (index + 1) % hits.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) =>
                hits.length === 0 ? 0 : (index - 1 + hits.length) % hits.length,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              const hit = hits[activeIndex];
              if (hit) pick(hit);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={
            loading && !followings
              ? "正在加载关注列表…"
              : "搜索关注的 UP（支持昵称 / UID）"
          }
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showMenu && menuPos && (
        <OverlayPortal>
          <div
            id="following-search-menu"
            role="listbox"
            data-glass-panel
            className={cn(
              "bili-glass fixed max-h-80 overflow-y-auto rounded-lg border border-border bg-card shadow-xl",
              APP_OVERLAY_ZCLASS,
            )}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: Math.max(menuPos.width, 280),
            }}
          >
            {!followings ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                关注列表还在加载，稍等一下就能搜了
              </p>
            ) : hits.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                没有匹配的关注 UP
              </p>
            ) : (
              hits.map((hit, index) => (
                <button
                  key={hit.up.mid}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-secondary",
                    index === activeIndex && "bg-secondary",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(hit)}
                >
                  <BiliImage
                    src={hit.up.face}
                    alt=""
                    className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {hit.up.uname}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      本地：{hit.localPath ?? "未分组"}
                      {hit.biliTags.length > 0
                        ? ` · B站：${hit.biliTags.join(" / ")}`
                        : ""}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
