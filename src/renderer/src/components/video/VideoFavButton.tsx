import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VideoFavFolder } from "@shared/types";
import { CreateFavFolderControl } from "@/components/favorites/CreateFavFolderControl";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import { Bookmark, Folder, Loader2, Sparkles, X } from "lucide-react";
import { useFavoritesStore } from "@/stores/favorites-store";
import { ChargeRing } from "@/components/video/ChargeRing";

interface VideoFavButtonProps {
  aid: number;
  title?: string;
  intro?: string;
  ownerName?: string;
  /** 展示用收藏总数；有值时按钮显示数字而非文案 */
  count?: number;
  className?: string;
  /** toolbar：视频页互动栏样式 */
  appearance?: "default" | "toolbar";
  /** 0 隐藏；三连长按充电进度 */
  chargeProgress?: number;
  pop?: boolean;
  /** 三连等外部操作后的收藏态，优先于本地列表 */
  collected?: boolean;
  /** 变化时重新拉取收藏夹（三连成功后同步） */
  reloadToken?: number;
  onCollectedChange?: (collected: boolean) => void;
}

function formatFavError(err: unknown): string {
  const message = err instanceof Error ? err.message : "操作失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

export function VideoFavButton({
  aid,
  title = "",
  intro,
  ownerName,
  count,
  className,
  appearance = "default",
  chargeProgress = 0,
  pop = false,
  collected,
  reloadToken = 0,
  onCollectedChange,
}: VideoFavButtonProps) {
  const invalidateFolders = useFavoritesStore(
    (state) => state.invalidateFolders,
  );

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"recommend" | "pick">("pick");
  const [suggested, setSuggested] = useState<VideoFavFolder | null>(null);
  const [folders, setFolders] = useState<VideoFavFolder[]>([]);
  const [initialSelected, setInitialSelected] = useState<Set<number>>(
    new Set(),
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCollected =
    collected === true || folders.some((folder) => folder.collected);

  const persistSelection = async (
    nextSelected: Set<number>,
    options?: { closeOnSuccess?: boolean },
  ) => {
    const addMediaIds = [...nextSelected].filter(
      (id) => !initialSelected.has(id),
    );
    const delMediaIds = [...initialSelected].filter(
      (id) => !nextSelected.has(id),
    );

    if (addMediaIds.length === 0 && delMediaIds.length === 0) {
      if (options?.closeOnSuccess !== false) setOpen(false);
      return;
    }

    if (nextSelected.size === 0 && initialSelected.size === 0) {
      setError("请至少选择一个收藏夹");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await window.biliDesk.bili.setVideoFavFolders(
        aid,
        addMediaIds,
        delMediaIds,
      );
      invalidateFolders();
      const wasCollected = initialSelected.size > 0;
      const nowCollected = nextSelected.size > 0;
      setFolders((prev) =>
        prev.map((folder) => ({
          ...folder,
          collected: nextSelected.has(folder.id),
        })),
      );
      setSelected(new Set(nextSelected));
      setInitialSelected(new Set(nextSelected));
      if (wasCollected !== nowCollected) {
        onCollectedChange?.(nowCollected);
      }
      if (options?.closeOnSuccess !== false) setOpen(false);
    } catch (err) {
      setError(formatFavError(err));
    } finally {
      setSaving(false);
    }
  };

  const loadFolders = useCallback(
    async (preferRecommend: boolean) => {
      setLoading(true);
      setError("");
      try {
        const list = await window.biliDesk.bili.getVideoFavFolders(aid);
        setFolders(list);
        const collectedIds = new Set(
          list.filter((folder) => folder.collected).map((folder) => folder.id),
        );
        setInitialSelected(collectedIds);
        setSelected(new Set(collectedIds));

        const alreadyCollected = collectedIds.size > 0;
        if (!preferRecommend || alreadyCollected || !title.trim()) {
          setSuggested(null);
          setMode("pick");
          return;
        }

        try {
          const result = await window.biliDesk.bili.suggestFavFolder({
            aid,
            title,
            intro,
            ownerName,
            folderTitles: list.map((folder) => folder.title),
          });
          const folder = result?.title
            ? list.find((item) => item.title === result.title)
            : undefined;
          if (folder && !collectedIds.has(folder.id)) {
            setSuggested(folder);
            setMode("recommend");
          } else {
            setSuggested(null);
            setMode("pick");
          }
        } catch {
          setSuggested(null);
          setMode("pick");
        }
      } catch (err) {
        setError(formatFavError(err));
        setFolders([]);
        setInitialSelected(new Set());
        setSelected(new Set());
        setSuggested(null);
        setMode("pick");
      } finally {
        setLoading(false);
      }
    },
    [aid, intro, ownerName, title],
  );

  useEffect(() => {
    void loadFolders(false);
  }, [loadFolders, reloadToken]);

  useEffect(() => {
    if (collected !== true) return;
    setFolders((prev) => {
      if (prev.some((folder) => folder.collected)) return prev;
      const defaultId =
        prev.find((folder) => folder.isDefault)?.id ?? prev[0]?.id;
      if (defaultId == null) return prev;
      return prev.map((folder) =>
        folder.id === defaultId ? { ...folder, collected: true } : folder,
      );
    });
  }, [collected]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, saving]);

  const toggleFolder = (folderId: number) => {
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleOpen = () => {
    setError("");
    setSuggested(null);
    const alreadyCollected =
      collected === true || folders.some((folder) => folder.collected);
    setMode(alreadyCollected ? "pick" : "recommend");
    setOpen(true);
    void loadFolders(true);
  };

  const handleRejectSuggest = () => {
    setMode("pick");
    setError("");
  };

  const picker = (
    <>
      <div className="px-4 pt-3">
        <CreateFavFolderControl
          disabled={saving}
          onCreated={(folder) => {
            setFolders((prev) => {
              if (prev.some((item) => item.id === folder.id)) return prev;
              return [
                ...prev,
                { ...folder, collected: false, isDefault: false },
              ];
            });
            setSelected((prev) => new Set(prev).add(folder.id));
            setError("");
          }}
        />
      </div>

      <div className="scrollbar-overlay max-h-80 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载收藏夹...
          </div>
        ) : folders.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {error || "暂无收藏夹，点击左上角新建"}
          </p>
        ) : (
          <div className="space-y-1">
            {folders.map((folder) => {
              const checked = selected.has(folder.id);
              return (
                <label
                  key={folder.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    disabled={saving}
                    onChange={() => toggleFolder(folder.id)}
                  />
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {folder.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {folder.mediaCount}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error && folders.length > 0 && (
        <p className="px-4 pb-2 text-xs text-red-400">{error}</p>
      )}

      <div className="flex gap-2 border-t border-border p-3">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          取消
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={loading || saving || folders.length === 0}
          onClick={() => void persistSelection(selected)}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            "确定"
          )}
        </Button>
      </div>
    </>
  );

  const recommend = suggested ? (
    <div className="space-y-4 px-4 py-4">
      <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          推荐收藏夹
        </p>
        <div className="flex items-center gap-3">
          <Folder className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{suggested.title}</p>
            <p className="text-xs text-muted-foreground">
              {suggested.mediaCount} 个内容
            </p>
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        根据标题匹配你已有的夹。确定就放进去；拒绝后可以自己勾选。
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={handleRejectSuggest}
        >
          拒绝，自己选
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={saving}
          onClick={() => void persistSelection(new Set([suggested.id]))}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              收藏中...
            </>
          ) : (
            "确定"
          )}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      正在匹配收藏夹...
    </div>
  );

  const dialog = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!saving) setOpen(false);
      }}
    >
      <div
        className="relative z-[10000] w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              {mode === "recommend" ? "推荐收藏夹" : "添加到收藏夹"}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === "recommend"
                ? "先看推荐，也可以拒绝后自己分类"
                : "选择要收录此视频的 B 站收藏夹"}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {mode === "recommend" ? recommend : picker}
      </div>
    </div>
  ) : null;

  return (
    <>
      {appearance === "toolbar" ? (
        <button
          type="button"
          className={cn(
            "bili-toolbar-action",
            isCollected && "is-fav-active",
            pop && "is-pop",
            className,
          )}
          onClick={handleOpen}
          title={isCollected ? "已收藏" : "收藏"}
        >
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            <ChargeRing progress={chargeProgress} />
            <Bookmark
              className={cn(
                "bili-toolbar-icon h-6 w-6",
                isCollected && "fill-current",
              )}
            />
          </span>
          <span className="bili-toolbar-count">
            {count != null
              ? formatCount(count)
              : isCollected
                ? "已收藏"
                : "收藏"}
          </span>
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "gap-1.5",
            isCollected ? "bili-action-btn-active" : "bili-action-btn",
            className,
          )}
          onClick={handleOpen}
        >
          <Bookmark className={cn("h-4 w-4", isCollected && "fill-current")} />
          {count != null ? formatCount(count) : isCollected ? "已收藏" : "收藏"}
        </Button>
      )}

      {dialog && createPortal(dialog, document.body)}
    </>
  );
}
