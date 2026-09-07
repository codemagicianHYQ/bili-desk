import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { List, MoreHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowButton } from "@/components/video/FollowButton";
import { FollowTagDialog } from "@/features/following/FollowTagDialog";
import { cn } from "@/lib/utils";
import { useFollowingStore } from "@/stores/following-store";
import { BILI_SPECIAL_FOLLOW_TAG_ID } from "@shared/types";

interface FollowActionButtonProps {
  mid: number;
  uname: string;
  face?: string;
  isFollowing: boolean;
  isSpecial?: boolean;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
  onFollowingChange: (following: boolean) => void;
  onSpecialChange?: (special: boolean) => void;
  onError?: (message: string) => void;
}

export function FollowActionButton({
  mid,
  uname,
  face = "",
  isFollowing,
  isSpecial = false,
  disabled = false,
  size = "sm",
  className,
  onFollowingChange,
  onSpecialChange,
  onError,
}: FollowActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [unfollowOpen, setUnfollowOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const followTags = useFollowingStore((state) => state.followTags);
  const refreshFollowTags = useFollowingStore(
    (state) => state.refreshFollowTags,
  );
  const patchFollowing = useFollowingStore((state) => state.patchFollowing);
  const patchFollowTagCount = useFollowingStore(
    (state) => state.patchFollowTagCount,
  );
  const patchSpecialFollowCount = useFollowingStore(
    (state) => state.patchSpecialFollowCount,
  );
  const invalidateFollowings = useFollowingStore(
    (state) => state.invalidateFollowings,
  );
  const storeEntry = useFollowingStore((state) =>
    state.allFollowings?.find((up) => up.mid === mid),
  );
  const showSpecial = Boolean(isSpecial) || Boolean(storeEntry?.special);

  useEffect(() => {
    if (!menuOpen) return;
    const updatePos = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updatePos();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        menuPanelRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [menuOpen]);

  const handleFollow = async () => {
    setLoading(true);
    try {
      await window.biliDesk.bili.modifyFollow(mid, true);
      onFollowingChange(true);
      invalidateFollowings();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "关注失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async () => {
    setLoading(true);
    try {
      await window.biliDesk.bili.modifyFollow(mid, false);
      onFollowingChange(false);
      onSpecialChange?.(false);
      patchFollowing(mid, null);
      invalidateFollowings();
      setUnfollowOpen(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "取消关注失败");
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    setLoading(true);
    try {
      await window.biliDesk.bili.modifyBlock(mid, true);
      onFollowingChange(false);
      onSpecialChange?.(false);
      patchFollowing(mid, null);
      invalidateFollowings();
      setBlockOpen(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "拉黑失败");
    } finally {
      setLoading(false);
    }
  };

  const openGroupDialog = () => {
    setMenuOpen(false);
    setTagDialogOpen(true);
    if (followTags.length === 0) {
      void refreshFollowTags().catch(() => {
        onError?.("加载关注分组失败");
      });
    }
  };

  const menuPortal =
    menuOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuPanelRef}
        className={`fixed min-w-[132px] overflow-hidden rounded-xl bg-zinc-800 py-1 shadow-2xl ${APP_OVERLAY_ZCLASS}`}
        style={{ top: menuPos.top, right: menuPos.right }}
      >
        {isFollowing && (
          <>
            <button
              type="button"
              className="w-full px-6 py-2.5 text-center text-sm text-white transition-colors hover:bg-white/10"
              onClick={openGroupDialog}
            >
              设置分组
            </button>
            <button
              type="button"
              className="w-full px-6 py-2.5 text-center text-sm text-white transition-colors hover:bg-white/10"
              onClick={() => {
                setMenuOpen(false);
                setUnfollowOpen(true);
              }}
            >
              取消关注
            </button>
          </>
        )}
        <button
          type="button"
          className="w-full px-6 py-2.5 text-center text-sm text-red-300 transition-colors hover:bg-white/10"
          onClick={() => {
            setMenuOpen(false);
            setBlockOpen(true);
          }}
        >
          拉黑
        </button>
      </div>,
      document.body,
    );

  const dialogs = (
    <>
      <FollowTagDialog
        up={tagDialogOpen ? { mid, uname } : null}
        tags={followTags}
        onClose={() => setTagDialogOpen(false)}
        onSaved={(change) => {
          const prev = new Set(change.prevTagIds.filter((id) => id !== 0));
          const next = new Set(change.nextTagIds.filter((id) => id !== 0));
          for (const tagId of next) {
            if (!prev.has(tagId)) patchFollowTagCount(tagId, 1);
          }
          for (const tagId of prev) {
            if (!next.has(tagId)) patchFollowTagCount(tagId, -1);
          }
          const wasSpecial = prev.has(BILI_SPECIAL_FOLLOW_TAG_ID);
          const nowSpecial = next.has(BILI_SPECIAL_FOLLOW_TAG_ID);
          if (wasSpecial !== nowSpecial) {
            patchFollowing(mid, { special: nowSpecial });
            patchSpecialFollowCount(nowSpecial ? 1 : -1);
            onSpecialChange?.(nowSpecial);
          }
        }}
      />

      <ConfirmDialog
        open={unfollowOpen}
        title="取消关注"
        description={`确定取消关注「${uname}」吗？之后可重新关注。`}
        confirmLabel="取消关注"
        cancelLabel="保留关注"
        destructive
        loading={loading}
        onConfirm={() => void handleUnfollow()}
        onCancel={() => {
          if (!loading) setUnfollowOpen(false);
        }}
      >
        {face ? (
          <BiliImage
            src={face}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-2 ring-border"
          />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={blockOpen}
        title="拉黑"
        description={`确定拉黑「${uname}」吗？拉黑后将取消关注，对方无法私信你；可在设置 → 黑名单取消。`}
        confirmLabel="拉黑"
        cancelLabel="取消"
        destructive
        loading={loading}
        onConfirm={() => void handleBlock()}
        onCancel={() => {
          if (!loading) setBlockOpen(false);
        }}
      >
        {face ? (
          <BiliImage
            src={face}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-2 ring-border"
          />
        ) : null}
      </ConfirmDialog>
    </>
  );

  if (!isFollowing) {
    return (
      <>
        <div
          ref={wrapRef}
          className={cn("relative flex shrink-0 items-center gap-1", className)}
        >
          <FollowButton
            isFollowing={false}
            loading={loading}
            disabled={disabled}
            size={size}
            onClick={() => void handleFollow()}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled || loading}
            className={cn(
              "text-muted-foreground",
              size === "sm" && "h-8 w-8",
            )}
            aria-label="更多"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        {menuPortal}
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div ref={wrapRef} className={cn("relative shrink-0", className)}>
        <Button
          type="button"
          size={size}
          variant="secondary"
          disabled={disabled || loading}
          className={cn(
            "gap-1.5 border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80",
            showSpecial && "text-primary",
            menuOpen && "bg-muted/80",
          )}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {showSpecial ? (
            <Star className="h-3.5 w-3.5 fill-current" />
          ) : (
            <List className="h-3.5 w-3.5" />
          )}
          {loading ? "处理中..." : showSpecial ? "特别关注" : "已关注"}
        </Button>
      </div>

      {menuPortal}
      {dialogs}
    </>
  );
}
