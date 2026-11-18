import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BookOpen, ChevronRight, Hash, Music } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn } from "@/lib/utils";
function resolveTagHref(tag) {
    const jump = tag.jumpUrl?.trim();
    if (jump) {
        return jump.startsWith("//") ? `https:${jump}` : jump;
    }
    if (tag.kind === "topic" && tag.id > 0) {
        return `https://www.bilibili.com/v/topic/detail/?topic_id=${tag.id}`;
    }
    if (tag.id > 0)
        return `https://www.bilibili.com/tag/${tag.id}`;
    return `https://search.bilibili.com/all?keyword=${encodeURIComponent(tag.name)}`;
}
function TagIcon({ kind }) {
    if (kind === "topic")
        return _jsx(Hash, { className: "h-3 w-3 text-sky-400" });
    if (kind === "channel")
        return _jsx(BookOpen, { className: "h-3 w-3 text-sky-400" });
    if (kind === "bgm")
        return _jsx(Music, { className: "h-3 w-3 text-sky-400" });
    return null;
}
export function VideoTagList({ tags }) {
    const navigate = useNavigate();
    if (!tags?.length)
        return null;
    return (_jsx("div", { className: "flex flex-wrap items-center gap-2", children: tags.map((tag) => {
            const featured = tag.kind !== "normal" || Boolean(tag.jumpUrl);
            return (_jsxs("button", { type: "button", className: cn("inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1", "text-xs text-muted-foreground transition-colors", "hover:bg-secondary/80 hover:text-foreground"), title: tag.name, onClick: () => {
                    if (tag.kind === "topic" && tag.id > 0) {
                        navigate(`/topic/${tag.id}?name=${encodeURIComponent(tag.name)}`);
                        return;
                    }
                    if (tag.kind === "channel") {
                        const fromUrl = tag.jumpUrl?.match(/channel(?:\/|%2F|id=)(\d+)/i)?.[1];
                        const channelId = Number(fromUrl || tag.id);
                        if (channelId > 0) {
                            navigate(`/channel/${channelId}?name=${encodeURIComponent(tag.name)}`);
                            return;
                        }
                    }
                    if (tag.kind === "bgm") {
                        const fromUrl = tag.jumpUrl?.match(/au(\d+)/i)?.[1] ||
                            tag.jumpUrl?.match(/music-detail\/(\d+)/)?.[1];
                        const sid = Number(fromUrl || tag.id);
                        if (sid > 0) {
                            navigate(`/audio/${sid}`);
                            return;
                        }
                    }
                    void openBiliHref(resolveTagHref(tag), navigate);
                }, children: [_jsx(TagIcon, { kind: tag.kind }), _jsx("span", { className: "truncate", children: tag.name }), featured ? (_jsx(ChevronRight, { className: "h-3 w-3 shrink-0 opacity-55" })) : null] }, `${tag.kind}-${tag.id}-${tag.name}`));
        }) }));
}
