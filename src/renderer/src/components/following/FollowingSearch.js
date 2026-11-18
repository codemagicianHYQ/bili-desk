import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
function scoreMatch(name, query) {
    const n = name.toLowerCase();
    const q = query.toLowerCase();
    if (!q)
        return 0;
    if (n === q)
        return 100;
    if (n.startsWith(q))
        return 80;
    const index = n.indexOf(q);
    if (index >= 0)
        return 60 - Math.min(index, 20);
    return 0;
}
export function FollowingSearch({ followings, assignments, biliTagByMid, loading = false, onPickLocal, className, }) {
    const navigate = useNavigate();
    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [menuPos, setMenuPos] = useState(null);
    const assignmentByMid = useMemo(() => {
        const map = new Map();
        for (const item of assignments)
            map.set(item.mid, item);
        return map;
    }, [assignments]);
    const hits = useMemo(() => {
        const q = query.trim();
        if (!q || !followings)
            return [];
        const midQuery = /^\d+$/.test(q) ? Number(q) : null;
        const ranked = [];
        for (const up of followings) {
            let score = scoreMatch(up.uname, q);
            if (midQuery != null && up.mid === midQuery)
                score = Math.max(score, 95);
            else if (String(up.mid).includes(q))
                score = Math.max(score, 40);
            if (score <= 0)
                continue;
            const assignment = assignmentByMid.get(up.mid);
            const biliTags = [...(biliTagByMid.get(up.mid) ?? [])];
            if (up.special && !biliTags.includes("特别关注")) {
                biliTags.unshift("特别关注");
            }
            ranked.push({
                up,
                score,
                localPath: assignment ? `${assignment.l1} / ${assignment.l2}` : null,
                localSelection: assignment
                    ? { level: "l2", id: assignment.l2Id }
                    : { level: "uncategorized", id: null },
                biliTags,
            });
        }
        ranked.sort((a, b) => b.score - a.score || a.up.uname.localeCompare(b.up.uname, "zh-CN"));
        return ranked.slice(0, 12);
    }, [assignmentByMid, biliTagByMid, followings, query]);
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);
    useEffect(() => {
        if (!open || !rootRef.current) {
            setMenuPos(null);
            return;
        }
        const rect = rootRef.current.getBoundingClientRect();
        setMenuPos({
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        });
    }, [open, query, hits.length]);
    useEffect(() => {
        if (!open)
            return;
        const onDown = (event) => {
            const target = event.target;
            if (rootRef.current?.contains(target))
                return;
            const menu = document.getElementById("following-search-menu");
            if (menu?.contains(target))
                return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);
    const pick = (hit) => {
        setQuery(hit.up.uname);
        setOpen(false);
        if (hit.localSelection)
            onPickLocal(hit.localSelection, hit.up.mid);
        else
            navigate(`/up/${hit.up.mid}`);
    };
    const showMenu = open && query.trim().length > 0;
    return (_jsxs("div", { ref: rootRef, className: cn("relative min-w-0", className), children: [_jsxs("div", { className: "flex h-8 items-center gap-1.5 rounded-md border border-border bg-background/70 px-2", children: [_jsx(Search, { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" }), _jsx("input", { ref: inputRef, value: query, onChange: (event) => {
                            setQuery(event.target.value);
                            setOpen(true);
                        }, onFocus: () => setOpen(true), onKeyDown: (event) => {
                            if (!showMenu)
                                return;
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setActiveIndex((index) => hits.length === 0 ? 0 : (index + 1) % hits.length);
                            }
                            else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setActiveIndex((index) => hits.length === 0 ? 0 : (index - 1 + hits.length) % hits.length);
                            }
                            else if (event.key === "Enter") {
                                event.preventDefault();
                                const hit = hits[activeIndex];
                                if (hit)
                                    pick(hit);
                            }
                            else if (event.key === "Escape") {
                                setOpen(false);
                            }
                        }, placeholder: loading && !followings
                            ? "正在加载关注列表…"
                            : "搜索关注的 UP（支持昵称 / UID）", className: "min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" }), query && (_jsx("button", { type: "button", className: "rounded p-0.5 text-muted-foreground hover:text-foreground", onClick: () => {
                            setQuery("");
                            setOpen(false);
                            inputRef.current?.focus();
                        }, children: _jsx(X, { className: "h-3.5 w-3.5" }) }))] }), showMenu && menuPos && (_jsx(OverlayPortal, { children: _jsx("div", { id: "following-search-menu", role: "listbox", "data-glass-panel": true, className: cn("bili-glass fixed max-h-80 overflow-y-auto rounded-lg border border-border bg-card shadow-xl", APP_OVERLAY_ZCLASS), style: {
                        top: menuPos.top,
                        left: menuPos.left,
                        width: Math.max(menuPos.width, 280),
                    }, children: !followings ? (_jsx("p", { className: "px-3 py-3 text-xs text-muted-foreground", children: "\u5173\u6CE8\u5217\u8868\u8FD8\u5728\u52A0\u8F7D\uFF0C\u7A0D\u7B49\u4E00\u4E0B\u5C31\u80FD\u641C\u4E86" })) : hits.length === 0 ? (_jsx("p", { className: "px-3 py-3 text-xs text-muted-foreground", children: "\u6CA1\u6709\u5339\u914D\u7684\u5173\u6CE8 UP" })) : (hits.map((hit, index) => (_jsxs("button", { type: "button", role: "option", "aria-selected": index === activeIndex, className: cn("flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-secondary", index === activeIndex && "bg-secondary"), onMouseEnter: () => setActiveIndex(index), onClick: () => pick(hit), children: [_jsx(BiliImage, { src: hit.up.face, alt: "", className: "mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: hit.up.uname }), _jsxs("p", { className: "mt-0.5 truncate text-[11px] text-muted-foreground", children: ["\u672C\u5730\uFF1A", hit.localPath ?? "未分组", hit.biliTags.length > 0
                                                ? ` · B站：${hit.biliTags.join(" / ")}`
                                                : ""] })] })] }, hit.up.mid)))) }) }))] }));
}
