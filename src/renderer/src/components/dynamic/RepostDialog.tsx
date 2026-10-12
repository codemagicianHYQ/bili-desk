import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayPortal, APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";

export function RepostDialog({
  open,
  dynId,
  preview,
  onClose,
  onDone,
}: {
  open: boolean;
  dynId: string;
  preview?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await window.biliDesk.bili.repostDynamic(dynId, text);
      setText("");
      onDone?.();
      onClose();
    } catch (err) {
      setError(extractIpcErrorMessage(err) || "转发失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayPortal>
      <div
        className={cn(
          "fixed inset-0 flex items-center justify-center bg-black/55 p-4",
          APP_OVERLAY_ZCLASS,
        )}
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 className="text-base font-semibold">转发动态</h2>
          {preview && (
            <p className="mt-2 line-clamp-3 rounded-lg bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
              {preview}
            </p>
          )}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 1000))}
            rows={4}
            placeholder="说点什么，也可以直接转发"
            className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "转发中..." : "转发"}
            </Button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
