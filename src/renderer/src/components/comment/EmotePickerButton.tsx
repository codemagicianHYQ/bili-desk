import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Smile, X } from "lucide-react";

interface EmotePickerProps {
  onPick: (emoteText: string) => void;
  className?: string;
}

let panelCache: Record<string, string> | null = null;

export function EmotePickerButton({ onPick, className }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emotes, setEmotes] = useState<Record<string, string>>(
    () => panelCache ?? {},
  );

  useEffect(() => {
    if (!open) return;
    if (panelCache && Object.keys(panelCache).length > 0) {
      setEmotes(panelCache);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void window.biliDesk.bili
      .getReplyEmotes()
      .then((map) => {
        panelCache = map;
        if (!cancelled) setEmotes(map);
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

  const entries = useMemo(
    () =>
      Object.entries(emotes).sort(([a], [b]) => a.localeCompare(b, "zh-Hans")),
    [emotes],
  );

  const dialog = open
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative z-[10000] flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">插入表情</p>
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

            <div className="scrollbar-overlay max-h-80 overflow-y-auto p-3">
              {loading ? (
                <p className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加载表情...
                </p>
              ) : error ? (
                <p className="py-10 text-center text-sm text-red-400">
                  {error}
                </p>
              ) : entries.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  暂无可用表情
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                  {entries.map(([text, url]) => (
                    <button
                      key={text}
                      type="button"
                      title={text}
                      onClick={() => {
                        onPick(text);
                        setOpen(false);
                      }}
                      className="flex h-10 items-center justify-center rounded-lg transition-colors hover:bg-secondary"
                    >
                      <BiliImage
                        src={url}
                        alt={text}
                        className="h-7 w-7 object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
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
