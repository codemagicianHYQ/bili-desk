import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { SpaceDynamicItem } from "@shared/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { upRelationCache } from "@/lib/session-data-cache";
import { cn } from "@/lib/utils";
import { useFollowingStore } from "@/stores/following-store";
import { AlertTriangle, Share2, Trash2, UserMinus } from "lucide-react";

/** 网页动态三点「举报」理由，reason_type 与接口一致 */
const DYNAMIC_REPORT_REASONS: Array<{ id: number; label: string }> = [
  { id: 3, label: "违法违规" },
  { id: 1, label: "色情低俗" },
  { id: 4, label: "垃圾广告" },
  { id: 5, label: "人身攻击" },
  { id: 6, label: "侵犯隐私" },
  { id: 8, label: "引战" },
  { id: 0, label: "其他" },
];

function shareUrl(item: SpaceDynamicItem): string {
  if (item.bvid) return `https://www.bilibili.com/video/${item.bvid}`;
  if (item.cvId) return `https://www.bilibili.com/read/cv${item.cvId}`;
  if (item.liveRoomId) return `https://live.bilibili.com/${item.liveRoomId}`;
  return `https://www.bilibili.com/opus/${item.id}`;
}

function formatError(err: unknown): string {
  return extractIpcErrorMessage(err) || "操作失败";
}

export function DynamicMoreSheet({
  open,
  anchorRef,
  item,
  isOwn,
  authorName,
  onClose,
  onTip,
  onRemoved,
  onUnfollowed,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  item: SpaceDynamicItem;
  isOwn: boolean;
  authorName: string;
  onClose: () => void;
  onTip: (message: string) => void;
  onRemoved?: (id: string) => void;
  onUnfollowed?: (mid: number) => void;
}) {
  const patchFollowing = useFollowingStore((state) => state.patchFollowing);
  const removeMidFromTagLists = useFollowingStore(
    (state) => state.removeMidFromTagLists,
  );
  const invalidateSidebar = useFollowingStore(
    (state) => state.invalidateSidebar,
  );
  const [view, setView] = useState<"main" | "report">("main");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 8 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = panelRef.current?.offsetHeight ?? 160;
      const gap = 6;
      const right = Math.max(8, window.innerWidth - anchor.right);
      let top = anchor.bottom + gap;
      if (
        top + height > window.innerHeight - 8 &&
        anchor.top - gap - height > 8
      ) {
        top = anchor.top - gap - height;
      }
      setPos({ top, right });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, view, anchorRef]);

  const closeAll = () => {
    if (busy) return;
    setView("main");
    onClose();
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(item));
      onClose();
      onTip("链接已复制");
    } catch {
      onTip("复制失败");
    }
  };

  const handleUnfollow = async () => {
    const mid = item.authorMid;
    if (!mid || busy) return;
    setBusy(true);
    try {
      await window.biliDesk.bili.modifyFollow(mid, false);
      patchFollowing(mid, null);
      removeMidFromTagLists(mid);
      invalidateSidebar();
      upRelationCache.set(String(mid), {
        isFollowing: false,
        attribute: 0,
        special: false,
      });
      setConfirmUnfollow(false);
      onClose();
      onUnfollowed?.(mid);
      onTip(`已取消关注「${authorName}」`);
    } catch (err) {
      onTip(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.biliDesk.bili.removeDynamic(item.id);
      setConfirmDelete(false);
      onClose();
      onRemoved?.(item.id);
      onTip("已删除");
    } catch (err) {
      onTip(formatError(err));
      setBusy(false);
    }
  };

  const handleReport = async (reasonType: number) => {
    const mid = item.authorMid;
    if (!mid || busy) return;
    setBusy(true);
    try {
      await window.biliDesk.bili.reportDynamic(item.id, mid, reasonType);
      setView("main");
      onClose();
      onTip("已提交举报");
    } catch (err) {
      onTip(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const row =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#e3e5e7] transition-colors hover:bg-white/5 disabled:opacity-50";

  return (
    <>
      {open && (
        <OverlayPortal>
          <button
            type="button"
            aria-label="关闭动态设置"
            className={cn(
              "fixed inset-0 cursor-default border-0 bg-transparent p-0",
              APP_OVERLAY_ZCLASS,
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              closeAll();
            }}
          />
          <div
            ref={panelRef}
            role="menu"
            className={cn(
              "fixed w-40 overflow-hidden rounded-xl bg-[#2b2d31] py-1 shadow-2xl ring-1 ring-white/10",
              APP_OVERLAY_ZCLASS,
            )}
            style={{ top: pos.top, right: pos.right }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {view === "report" ? (
              <>
                <p className="px-3 pb-1 pt-1.5 text-xs text-[#9499a0]">
                  选择举报理由
                </p>
                {DYNAMIC_REPORT_REASONS.map((reason) => (
                  <button
                    key={reason.id}
                    type="button"
                    disabled={busy}
                    className={row}
                    onClick={() => void handleReport(reason.id)}
                  >
                    {reason.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={cn(row, "text-[#9499a0]")}
                  onClick={() => setView("main")}
                >
                  返回
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={row}
                  onClick={() => void handleShare()}
                >
                  <Share2 className="h-4 w-4 text-[#fb7299]" />
                  分享
                </button>
                {!isOwn && item.authorMid ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={row}
                    onClick={() => {
                      onClose();
                      setConfirmUnfollow(true);
                    }}
                  >
                    <UserMinus className="h-4 w-4 text-[#fb7299]" />
                    取消关注
                  </button>
                ) : null}
                {!isOwn && item.authorMid ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={row}
                    onClick={() => setView("report")}
                  >
                    <AlertTriangle className="h-4 w-4 text-[#fb7299]" />
                    举报
                  </button>
                ) : null}
                {isOwn ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={cn(row, "text-rose-400")}
                    onClick={() => {
                      onClose();
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                ) : null}
              </>
            )}
          </div>
        </OverlayPortal>
      )}
      <ConfirmDialog
        open={confirmUnfollow}
        title={`取消关注「${authorName}」？`}
        description="取消后，对方的新动态不会再出现在关注动态里"
        confirmLabel="取消关注"
        destructive
        loading={busy}
        onCancel={() => {
          if (!busy) setConfirmUnfollow(false);
        }}
        onConfirm={() => void handleUnfollow()}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="要删除动态吗？"
        description="动态删除后将无法恢复，请谨慎操作"
        confirmLabel="确认删除"
        destructive
        loading={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
