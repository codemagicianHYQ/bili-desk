import { useEffect, useState } from "react";
import type { FavFolder } from "@shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Folder, Loader2, X } from "lucide-react";

interface FavMoveDialogProps {
  open: boolean;
  folders: FavFolder[];
  sourceFolderId: number;
  selectedCount: number;
  loading?: boolean;
  error?: string;
  onConfirm: (targetFolderId: number) => void;
  onClose: () => void;
}

export function FavMoveDialog({
  open,
  folders,
  sourceFolderId,
  selectedCount,
  loading = false,
  error = "",
  onConfirm,
  onClose,
}: FavMoveDialogProps) {
  const [targetId, setTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setTargetId(null);
      return;
    }
    const firstOther = folders.find((folder) => folder.id !== sourceFolderId);
    setTargetId(firstOther?.id ?? null);
  }, [open, folders, sourceFolderId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const targets = folders.filter((folder) => folder.id !== sourceFolderId);
  const sourceTitle =
    folders.find((folder) => folder.id === sourceFolderId)?.title ??
    "当前收藏夹";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">批量移动到收藏夹</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              已选 {selectedCount} 个视频 · 从「{sourceTitle}」移出
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto p-3">
          {targets.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              没有其他可移动到的收藏夹
            </p>
          ) : (
            targets.map((folder) => {
              const active = targetId === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  disabled={loading}
                  onClick={() => setTargetId(folder.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-secondary",
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {folder.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {folder.mediaCount}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 border-t border-border p-4">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={loading}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={loading || targetId == null || targets.length === 0}
            onClick={() => {
              if (targetId != null) onConfirm(targetId);
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                移动中...
              </>
            ) : (
              "确认移动"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
