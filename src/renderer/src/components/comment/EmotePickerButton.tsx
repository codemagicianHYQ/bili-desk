import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReplyEmoteItem, ReplyEmotePackage } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { loadReplyEmotePackages } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Smile, X } from "lucide-react";

interface EmotePickerProps {
  onPick: (emoteText: string) => void;
  className?: string;
}

let lastPackId = 0;

function isKaomoji(item: ReplyEmoteItem, packType: number): boolean {
  return item.type === 4 || packType === 4;
}

export function EmotePickerButton({ onPick, className }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState<ReplyEmotePackage[]>([]);
  const [activeId, setActiveId] = useState(lastPackId);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    void loadReplyEmotePackages()
      .then((panel) => {
        if (cancelled) return;
        const next = panel.packages ?? [];
        setPacks(next);
        const preferred =
          next.find((pack) => pack.id === lastPackId)?.id ?? next[0]?.id ?? 0;
        setActiveId(preferred);
        lastPackId = preferred;
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "表情加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const active = packs.find((pack) => pack.id === activeId) ?? packs[0];
  const large = active?.emotes.some((item) => item.size === 2) ?? false;

  const selectPack = (id: number) => {
    lastPackId = id;
    setActiveId(id);
    gridRef.current?.scrollTo({ top: 0 });
  };

  const stepPack = (dir: -1 | 1) => {
    if (packs.length === 0) return;
    const index = packs.findIndex((pack) => pack.id === activeId);
    const from = index >= 0 ? index : 0;
    const next = packs[(from + dir + packs.length) % packs.length];
    if (next) selectPack(next.id);
  };

  useEffect(() => {
    if (!open) return;
    const tab = tabRowRef.current?.querySelector(
      `[data-pack-id="${activeId}"]`,
    );
    tab?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeId, open]);

  const dialog = open
    ? createPortal(
        <div
          className={`fixed inset-0 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative z-[10000] flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {active?.name || "插入表情"}
                </p>
                <p className="text-xs text-muted-foreground">
                  点击表情会插入到评论输入框
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={gridRef}
              className="scrollbar-overlay h-72 overflow-y-auto p-3"
            >
              {loading ? (
                <p className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加载表情...
                </p>
              ) : error ? (
                <p className="py-10 text-center text-sm text-red-400">
                  {error}
                </p>
              ) : !active ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  暂无可用表情
                </p>
              ) : (
                <div
                  className={cn(
                    "grid gap-1.5",
                    large
                      ? "grid-cols-5 sm:grid-cols-6"
                      : "grid-cols-8 sm:grid-cols-10",
                  )}
                >
                  {active.emotes.map((item) => {
                    const kaomoji = isKaomoji(item, active.type);
                    return (
                      <button
                        key={`${active.id}-${item.text}`}
                        type="button"
                        title={item.text}
                        onClick={() => {
                          onPick(item.text);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                          large ? "h-14" : "h-10",
                          kaomoji && "px-1",
                        )}
                      >
                        {kaomoji ? (
                          <span className="truncate text-[11px] leading-tight text-foreground">
                            {item.text}
                          </span>
                        ) : (
                          <BiliImage
                            src={item.url}
                            alt={item.text}
                            className={cn(
                              "object-contain",
                              large ? "h-12 w-12" : "h-7 w-7",
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {packs.length > 1 ? (
              <div className="flex items-center gap-1 border-t border-border px-1.5 py-1.5">
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => stepPack(-1)}
                  aria-label="上一组表情包"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div
                  ref={tabRowRef}
                  className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto"
                >
                  {packs.map((pack) => {
                    const selected = pack.id === active?.id;
                    return (
                      <button
                        key={pack.id}
                        data-pack-id={pack.id}
                        type="button"
                        title={pack.name}
                        onClick={() => selectPack(pack.id)}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          selected
                            ? "bg-secondary ring-1 ring-border"
                            : "hover:bg-secondary/70",
                        )}
                      >
                        {pack.type === 4 ? (
                          <span className="text-[10px] text-muted-foreground">
                            Aa
                          </span>
                        ) : pack.icon ? (
                          <BiliImage
                            src={pack.icon}
                            alt={pack.name}
                            className="h-6 w-6 object-contain"
                          />
                        ) : (
                          <Smile className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => stepPack(1)}
                  aria-label="下一组表情包"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn("gap-1.5 text-muted-foreground", className)}
        onClick={() => setOpen(true)}
        title="插入表情"
      >
        <Smile className="h-4 w-4" />
        表情
      </Button>
      {dialog}
    </>
  );
}
