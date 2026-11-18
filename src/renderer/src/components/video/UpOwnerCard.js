import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { OfficialVerifyBadge, OfficialVerifyLine, officialKind, } from "@/components/up/OfficialVerify";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { upProfileCache, upRelationCache } from "@/lib/session-data-cache";
export function UpOwnerCard({ mid, name, face, trailing }) {
    const currentMid = useAppStore((state) => state.user?.mid ?? 0);
    const [profile, setProfile] = useState(null);
    const [relation, setRelation] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        setError("");
        const cachedProfile = upProfileCache.get(String(mid));
        const cachedRelation = upRelationCache.get(String(mid));
        if (cachedProfile)
            setProfile(cachedProfile);
        if (cachedRelation)
            setRelation(cachedRelation);
        const relationStale = !cachedRelation || cachedRelation.special === undefined;
        if (cachedProfile && !relationStale)
            return;
        Promise.all([
            cachedProfile
                ? Promise.resolve(cachedProfile)
                : window.biliDesk.bili.getUpProfile(mid),
            relationStale
                ? window.biliDesk.bili.getUpRelation(mid)
                : Promise.resolve(cachedRelation),
        ])
            .then(([upProfile, upRelation]) => {
            setProfile(upProfile);
            upProfileCache.set(String(mid), upProfile);
            if (!upRelation)
                return;
            setRelation(upRelation);
            upRelationCache.set(String(mid), upRelation);
        })
            .catch((e) => setError(e.message));
    }, [mid]);
    const displayName = profile?.name || name;
    const displayFace = profile?.face || face;
    const official = officialKind(profile?.officialType, profile?.officialDesc);
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4", children: [_jsxs(Link, { to: `/up/${mid}`, className: "flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80", children: [_jsxs("span", { className: "relative shrink-0", children: [_jsx(BiliImage, { src: displayFace, alt: displayName, className: "h-12 w-12 rounded-full object-cover ring-2 ring-border" }), official && _jsx(OfficialVerifyBadge, { type: official.type })] }), _jsxs("div", { className: "min-w-0 text-left", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [_jsx("p", { className: "truncate font-medium", children: displayName }), profile?.level != null && profile.level > 0 && (_jsxs("span", { className: profile.level >= 6
                                                    ? "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-red-500"
                                                    : profile.level >= 4
                                                        ? "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-orange-500"
                                                        : "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-slate-400", children: ["Lv", profile.level] }))] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [profile ? `${formatCount(profile.fans)} 粉丝` : "加载中...", profile ? ` · ${formatCount(profile.videos)} 投稿` : "", profile?.likes != null && profile.likes > 0
                                                ? ` · ${formatCount(profile.likes)} 获赞`
                                                : ""] }), official && (_jsx("div", { className: "mt-0.5", children: _jsx(OfficialVerifyLine, { type: official.type, desc: official.desc }) }))] })] }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center gap-2", children: [currentMid !== mid && (_jsx(FollowActionButton, { mid: mid, uname: displayName, face: displayFace, isFollowing: relation?.isFollowing ?? false, isSpecial: Boolean(relation?.special), disabled: !relation, onFollowingChange: (following) => {
                                    setRelation((prev) => {
                                        const next = prev
                                            ? {
                                                ...prev,
                                                isFollowing: following,
                                                special: following ? prev.special : false,
                                            }
                                            : { isFollowing: following, attribute: 0, special: false };
                                        upRelationCache.set(String(mid), next);
                                        return next;
                                    });
                                }, onSpecialChange: (special) => {
                                    setRelation((prev) => {
                                        const next = prev
                                            ? { ...prev, special }
                                            : { isFollowing: true, attribute: 2, special };
                                        upRelationCache.set(String(mid), next);
                                        return next;
                                    });
                                }, onError: setError })), trailing] })] }), error && _jsx("p", { className: "text-xs text-red-400", children: error })] }));
}
