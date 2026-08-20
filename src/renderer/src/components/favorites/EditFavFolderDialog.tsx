import { useEffect, useRef, useState } from "react";
import type { FavFolder } from "@shared/types";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { Loader2, X } from "lucide-react";
import { useFavoritesStore } from "@/stores/favorites-store";

const TITLE_MAX = 20;
const INTRO_MAX = 200;

function formatEditError(err: unknown): string {
  const message = extractIpcErrorMessage(err) || "保存失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

interface EditFavFolderDialogProps {
  folder: FavFolder | null;
  onClose: () => void;
}

export function EditFavFolderDialog({
  folder,
  onClose,
}: EditFavFolderDialogProps) {
  const patchFolder = useFavoritesStore((state) => state.patchFolder);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [introLoaded, setIntroLoaded] = useState(false);
  const [privateFolder, setPrivateFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const open = folder != null;

  useEffect(() => {
    if (!folder) return;
    setTitle(folder.title);
    setIntro(folder.intro ?? "");
    setIntroLoaded(folder.intro != null);
    setPrivateFolder(folder.privacy === 1);
    setError("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);

    void (async () => {
      try {
        const info = await window.biliDesk.bili.getFavFolderInfo(folder.id);
        setTitle((current) =>
          current === folder.title ? info.title : current,
        );
        setIntro((current) => (current ? current : (info.intro ?? "")));
        setPrivateFolder(info.privacy === 1);
        setIntroLoaded(true);
      } catch {
        setIntroLoaded(false);
      }
    })();

    return () => window.clearTimeout(timer);
  }, [folder]);

  useEffect(() => {
    if (!open || saving) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  if (!folder) return null;

  const handleSave = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("请输入收藏夹名称");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await window.biliDesk.bili.editFavFolder({
        mediaId: folder.id,
        title: nextTitle,
        intro: introLoaded ? intro.trim() : undefined,
        privacy: privateFolder ? 1 : 0,
      });
      patchFolder(folder.id, {
        title: updated.title || nextTitle,
        intro: updated.intro ?? intro.trim(),
        privacy: updated.privacy ?? (privateFolder ? 1 : 0),
        cover: updated.cover || folder.cover,
        mediaCount: updated.mediaCount || folder.mediaCount,
      });
      onClose();
    } catch (err) {
      setError(formatEditError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-fav-folder-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id="edit-fav-folder-title" className="text-base font-semibold">
            编辑收藏夹
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">名称</label>
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
                  void handleSave();
                }
              }}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {title.trim().length}/{TITLE_MAX}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              简介（可选）
            </label>
            <textarea
              value={intro}
              maxLength={INTRO_MAX}
              disabled={saving}
              rows={3}
              placeholder="给这个收藏夹写一句说明"
              onChange={(event) => {
                setIntro(event.target.value);
                setError("");
              }}
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>

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

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 p-4 pt-0">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={saving || !title.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                保存中
              </>
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
