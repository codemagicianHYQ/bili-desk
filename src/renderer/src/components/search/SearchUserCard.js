import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowButton } from "@/components/video/FollowButton";
import { LiveOnAirMark } from "@/components/live/LiveOnAirMark";
import { cn, formatCount } from "@/lib/utils";
export function SearchUserCard({ user, followed = false, onFollowChange, }) {
    const [isFollowing, setIsFollowing] = useState(followed || user.isFollowing);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        setIsFollowing(followed || user.isFollowing);
    }, [followed, user.isFollowing, user.mid]);
    const handleFollow = async () => {
        setLoading(true);
        try {
            const next = !isFollowing;
            await window.biliDesk.bili.modifyFollow(user.mid, next);
            setIsFollowing(next);
            onFollowChange?.(user.mid, next);
        }
        catch {
            // keep previous state
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-secondary/40", children: [_jsxs(Link, { to: user.isLive && user.roomId
                    ? `/live/${user.roomId}`
                    : `/up/${user.mid}`, className: "relative shrink-0", children: [_jsx(BiliImage, { src: user.face, alt: user.name, className: cn("h-16 w-16 rounded-full object-cover", user.isLive && user.roomId
                            ? "ring-2 ring-[#fb7299]"
                            : "ring-1 ring-border") }), user.isLive && user.roomId ? _jsx(LiveOnAirMark, {}) : null] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Link, { to: `/up/${user.mid}`, className: "truncate text-sm font-medium hover:text-primary", children: user.name }), user.level > 0 && (_jsxs("span", { className: cn("rounded px-1 py-0.5 text-[10px] font-semibold text-white", user.level >= 6
                                    ? "bg-red-500"
                                    : user.level >= 4
                                        ? "bg-blue-500"
                                        : "bg-slate-400"), children: ["LV", user.level] })), user.officialDesc && (_jsx("span", { className: "truncate text-[11px] text-primary", children: user.officialDesc }))] }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [formatCount(user.fans), "\u7C89\u4E1D \u00B7 ", formatCount(user.videos), "\u4E2A\u89C6\u9891"] }), _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: user.sign || "这个人很懒，什么都没有写" })] }), _jsx(FollowButton, { isFollowing: isFollowing, loading: loading, onClick: () => void handleFollow(), className: "shrink-0" })] }));
}
