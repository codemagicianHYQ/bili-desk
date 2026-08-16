import { useEffect, useRef, useState } from "react";
import type { FavFolder } from "@shared/types";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { useFavoritesStore } from "@/stores/favorites-store";

const TITLE_MAX = 20;

function formatCreateError(err: unknown): string {
  const message = extractIpcErrorMessage(err) || "创建失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface CreateFavFolderControlProps {
  disabled?: boolean;
  className?: string;
  onCreated?: (folder: FavFolder) => void;
}

export function CreateFavFolderControl({
  disabled = false,
  className,
  onCreated,
}: CreateFavFolderControlProps) {
  const addFolder = useFavoritesStore((state) => state.addFolder);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [privateFolder, setPrivateFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const reset = () => {
    setOpen(false);
    setTitle("");
    setPrivateFolder(false);
    setError("");
  };

  const handleCreate = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("请输入收藏夹名称");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const folder = await window.biliDesk.bili.createFavFolder({
        title: nextTitle,
        privacy: privateFolder ? 1 : 0,
      });
      addFolder(folder);
      onCreated?.(folder);
      reset();
    } catch (err) {
      setError(formatCreateError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground disabled:opacity-50",
          className,
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        新建收藏夹
      </button>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-secondary/30 p-2.5",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        maxLength={TITLE_MAX}
        disabled={saving}
        placeholder="收藏夹名称"
        autoComplete="off"
        onChange={(event) => {
          setTitle(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void handleCreate();
          }
          if (event.key === "Escape" && !saving) {
            event.preventDefault();
            event.stopPropagation();
            reset();
          }
        }}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={privateFolder}
            disabled={saving}
            onChange={(event) => setPrivateFolder(event.target.checked)}
          />
          设为私密
        </label>
        <span className="text-[11px] text-muted-foreground">
          {title.trim().length}/{TITLE_MAX}
        </span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={reset}
        >
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={saving || !title.trim()}
          onClick={() => void handleCreate()}
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              创建中
            </>
          ) : (
            "创建"
          )}
        </Button>
      </div>
    </div>
  );
}
