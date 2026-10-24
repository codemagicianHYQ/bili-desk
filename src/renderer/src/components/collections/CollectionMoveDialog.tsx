import { useEffect, useState } from "react";
import type { CollectionGroup, UserCollectionItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import type { CollectionTreeL1 } from "./CollectionGroupTree";

export function CollectionMoveDialog({
  item,
  current,
  tree,
  onConfirm,
  onClose,
}: {
  item: UserCollectionItem | null;
  current: CollectionGroup | undefined;
  tree: CollectionTreeL1[];
  onConfirm: (group: { l1: string; l2: string } | null) => Promise<void>;
  onClose: () => void;
}) {
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setL1(current?.l1 ?? "");
    setL2(current?.l2 ?? "");
    setError("");
  }, [item, current]);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [item, busy, onClose]);

  if (!item) return null;

  const submit = async (group: { l1: string; l2: string } | null) => {
    setBusy(true);
    setError("");
    try {
      await onConfirm(group);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const l2Options = tree.find((node) => node.name === l1.trim())?.children;

  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`}
        data-glass-scrim
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          data-glass-panel
          className="bili-glass w-full max-w-md rounded-2xl border border-border bg-card/40 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">移动到本地分类</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {item.title}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">一级分类</p>
              <div className="flex flex-wrap gap-1.5">
                {tree.map((node) => (
                  <button
                    key={node.name}
                    type="button"
                    onClick={() => {
                      setL1(node.name);
                      setL2("");
                    }}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs transition-colors",
                      l1 === node.name
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 hover:bg-secondary",
                    )}
                  >
                    {node.name}
                  </button>
                ))}
              </div>
              <input
                value={l1}
                onChange={(event) => setL1(event.target.value)}
                placeholder="或输入新的一级分类，如 AI"
                className="h-8 w-full rounded-md border border-border bg-background/60 px-2 text-sm outline-none focus:border-primary/60"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">二级分类</p>
              {l2Options && l2Options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {l2Options.map((node) => (
                    <button
                      key={node.name}
                      type="button"
                      onClick={() => setL2(node.name)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs transition-colors",
                        l2 === node.name
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 hover:bg-secondary",
                      )}
                    >
                      {node.name}
                    </button>
                  ))}
                </div>
              )}
              <input
                value={l2}
                onChange={(event) => setL2(event.target.value)}
                placeholder="如 AI视频；留空归入「综合」"
                className="h-8 w-full rounded-md border border-border bg-background/60 px-2 text-sm outline-none focus:border-primary/60"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <div className="flex gap-2 border-t border-border p-4">
            {current && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void submit(null)}
              >
                移出分类
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="ml-auto"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={busy || !l1.trim()}
              onClick={() =>
                void submit({ l1: l1.trim(), l2: l2.trim() || "综合" })
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
