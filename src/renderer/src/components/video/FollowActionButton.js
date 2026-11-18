import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { createPortal } from "react-dom";
import { FolderCog, List, MoreHorizontal, Star, StarOff, UserMinus, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowButton } from "@/components/video/FollowButton";
import { FollowTagDialog } from "@/features/following/FollowTagDialog";
import { cn } from "@/lib/utils";
import { useFollowingStore } from "@/stores/following-store";
import { BILI_SPECIAL_FOLLOW_TAG_ID } from "@shared/types";
export function FollowActionButton({ mid, uname, face = "", isFollowing, isSpecial = false, disabled = false, size = "sm", className, onFollowingChange, onSpecialChange, onError, }) {
    const [loading, setLoading] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [unfollowOpen, setUnfollowOpen] = useState(false);
    const [blockOpen, setBlockOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const wrapRef = useRef(null);
    const menuPanelRef = useRef(null);
    const followTags = useFollowingStore((state) => state.followTags);
    const refreshFollowTags = useFollowingStore((state) => state.refreshFollowTags);
    const patchFollowing = useFollowingStore((state) => state.patchFollowing);
    const patchFollowTagCount = useFollowingStore((state) => state.patchFollowTagCount);
    const patchSpecialFollowCount = useFollowingStore((state) => state.patchSpecialFollowCount);
    const invalidateFollowings = useFollowingStore((state) => state.invalidateFollowings);
    const storeEntry = useFollowingStore((state) => state.allFollowings?.find((up) => up.mid === mid));
    const showSpecial = Boolean(isSpecial) || Boolean(storeEntry?.special);
    useEffect(() => {
        if (!menuOpen)
            return;
        const updatePos = () => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (!rect)
                return;
            setMenuPos({
                top: rect.bottom + 6,
                right: Math.max(8, window.innerWidth - rect.right),
            });
        };
        updatePos();
        const onPointerDown = (event) => {
            const target = event.target;
            if (wrapRef.current?.contains(target) ||
                menuPanelRef.current?.contains(target)) {
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
        }
        catch (error) {
            onError?.(formatDisplayedError(error, undefined, "关注失败"));
        }
        finally {
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
        }
        catch (error) {
            onError?.(formatDisplayedError(error, undefined, "取消关注失败"));
        }
        finally {
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
        }
        catch (error) {
            onError?.(formatDisplayedError(error, undefined, "拉黑失败"));
        }
        finally {
            setLoading(false);
        }
    };
    const handleToggleSpecial = async () => {
        const next = !showSpecial;
        setMenuOpen(false);
        setLoading(true);
        try {
            await window.biliDesk.bili.modifySpecialFollow(mid, next);
            patchFollowing(mid, { special: next });
            patchSpecialFollowCount(next ? 1 : -1);
            onSpecialChange?.(next);
        }
        catch (error) {
            onError?.(error instanceof Error
                ? error.message
                : next
                    ? "加入特别关注失败"
                    : "移除特别关注失败");
        }
        finally {
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
    const menuPortal = menuOpen &&
        typeof document !== "undefined" &&
        createPortal(_jsxs("div", { ref: menuPanelRef, className: `fixed min-w-[168px] overflow-hidden rounded-xl bg-zinc-800 py-1 shadow-2xl ${APP_OVERLAY_ZCLASS}`, style: { top: menuPos.top, right: menuPos.right }, children: [isFollowing && (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-amber-200 transition-colors hover:bg-white/10", onClick: openGroupDialog, children: [_jsx(FolderCog, { className: "h-4 w-4 shrink-0" }), "\u8BBE\u7F6E\u5206\u7EC4"] }), _jsxs("button", { type: "button", disabled: loading, className: "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-amber-200 transition-colors hover:bg-white/10 disabled:opacity-50", onClick: () => void handleToggleSpecial(), children: [showSpecial ? (_jsx(StarOff, { className: "h-4 w-4 shrink-0" })) : (_jsx(Star, { className: "h-4 w-4 shrink-0" })), showSpecial ? "移除特别关注" : "加入特别关注"] }), _jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-white/10", onClick: () => {
                                setMenuOpen(false);
                                setUnfollowOpen(true);
                            }, children: [_jsx(UserMinus, { className: "h-4 w-4 shrink-0" }), "\u53D6\u6D88\u5173\u6CE8"] })] })), _jsx("button", { type: "button", className: "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-white/10", onClick: () => {
                        setMenuOpen(false);
                        setBlockOpen(true);
                    }, children: "\u62C9\u9ED1" })] }), document.body);
    const dialogs = (_jsxs(_Fragment, { children: [_jsx(FollowTagDialog, { up: tagDialogOpen ? { mid, uname } : null, tags: followTags, onClose: () => setTagDialogOpen(false), onSaved: (change) => {
                    const prev = new Set(change.prevTagIds.filter((id) => id !== 0));
                    const next = new Set(change.nextTagIds.filter((id) => id !== 0));
                    for (const tagId of next) {
                        if (!prev.has(tagId))
                            patchFollowTagCount(tagId, 1);
                    }
                    for (const tagId of prev) {
                        if (!next.has(tagId))
                            patchFollowTagCount(tagId, -1);
                    }
                    const wasSpecial = prev.has(BILI_SPECIAL_FOLLOW_TAG_ID);
                    const nowSpecial = next.has(BILI_SPECIAL_FOLLOW_TAG_ID);
                    if (wasSpecial !== nowSpecial) {
                        patchFollowing(mid, { special: nowSpecial });
                        patchSpecialFollowCount(nowSpecial ? 1 : -1);
                        onSpecialChange?.(nowSpecial);
                    }
                } }), _jsx(ConfirmDialog, { open: unfollowOpen, title: "\u53D6\u6D88\u5173\u6CE8", description: `确定取消关注「${uname}」吗？之后可重新关注。`, confirmLabel: "\u53D6\u6D88\u5173\u6CE8", cancelLabel: "\u4FDD\u7559\u5173\u6CE8", destructive: true, loading: loading, onConfirm: () => void handleUnfollow(), onCancel: () => {
                    if (!loading)
                        setUnfollowOpen(false);
                }, children: face ? (_jsx(BiliImage, { src: face, alt: "", className: "h-12 w-12 rounded-full object-cover ring-2 ring-border" })) : null }), _jsx(ConfirmDialog, { open: blockOpen, title: "\u62C9\u9ED1", description: `确定拉黑「${uname}」吗？拉黑后将取消关注，对方无法私信你；可在设置 → 黑名单取消。`, confirmLabel: "\u62C9\u9ED1", cancelLabel: "\u53D6\u6D88", destructive: true, loading: loading, onConfirm: () => void handleBlock(), onCancel: () => {
                    if (!loading)
                        setBlockOpen(false);
                }, children: face ? (_jsx(BiliImage, { src: face, alt: "", className: "h-12 w-12 rounded-full object-cover ring-2 ring-border" })) : null })] }));
    if (!isFollowing) {
        return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: wrapRef, className: cn("relative flex shrink-0 items-center gap-1", className), children: [_jsx(FollowButton, { isFollowing: false, loading: loading, disabled: disabled, size: size, onClick: () => void handleFollow() }), _jsx(Button, { type: "button", size: "icon", variant: "ghost", disabled: disabled || loading, className: cn("text-muted-foreground", size === "sm" && "h-8 w-8"), "aria-label": "\u66F4\u591A", onClick: () => setMenuOpen((open) => !open), children: _jsx(MoreHorizontal, { className: "h-4 w-4" }) })] }), menuPortal, dialogs] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { ref: wrapRef, className: cn("relative shrink-0", className), children: _jsxs(Button, { type: "button", size: size, variant: "secondary", disabled: disabled || loading, className: cn("gap-1.5 border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80", showSpecial && "text-primary", menuOpen && "bg-muted/80"), onClick: () => setMenuOpen((open) => !open), children: [showSpecial ? (_jsx(Star, { className: "h-3.5 w-3.5 fill-current" })) : (_jsx(List, { className: "h-3.5 w-3.5" })), loading ? "处理中..." : showSpecial ? "特别关注" : "已关注"] }) }), menuPortal, dialogs] }));
}
