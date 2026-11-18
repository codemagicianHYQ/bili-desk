import { jsx as _jsx } from "react/jsx-runtime";
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { BvidTextLink, ExternalTextLink } from "@/components/ui/linkified-text";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { splitLinkifiedText } from "@shared/utils/external-url";
/** 评论 / 动态里的 `[doge]` 一类转义符 */
const EMOTE_TOKEN_RE = /(\[[^[\]]{1,32}\])/g;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function splitMentionedText(text, mentions) {
    if (!text)
        return [];
    const usable = (mentions ?? [])
        .filter((item) => item.mid > 0 && item.name.trim())
        .sort((a, b) => b.name.length - a.name.length);
    if (usable.length === 0)
        return [{ kind: "text", value: text }];
    const lookup = new Map();
    for (const item of usable) {
        const rawName = item.name.trim();
        const token = rawName.startsWith("@") || rawName.startsWith("＠")
            ? rawName
            : `@${rawName}`;
        if (!lookup.has(token))
            lookup.set(token, item.mid);
        const wideToken = token.replace(/^@/, "＠");
        if (!lookup.has(wideToken))
            lookup.set(wideToken, item.mid);
    }
    const pattern = [...lookup.keys()]
        .map((token) => escapeRegExp(token))
        .join("|");
    if (!pattern)
        return [{ kind: "text", value: text }];
    const parts = text.split(new RegExp(`(${pattern})`, "g"));
    return parts.filter(Boolean).map((part) => {
        const mid = lookup.get(part);
        return mid
            ? { kind: "mention", value: part, mid }
            : { kind: "text", value: part };
    });
}
export function BiliEmoteText({ text, emotes, mentions, className, size = 20, }) {
    const resolvedEmotes = useReplyEmotes(emotes);
    const parts = useMemo(() => {
        if (!text)
            return [];
        return text.split(EMOTE_TOKEN_RE);
    }, [text]);
    return (_jsx("span", { className: cn("whitespace-pre-wrap break-words", className), children: parts.map((part, index) => {
            if (!part)
                return null;
            const url = resolvedEmotes[part];
            if (url && part.startsWith("[") && part.endsWith("]")) {
                return (_jsx(BiliImage, { src: url, alt: part, title: part, className: "mx-0.5 inline-block align-text-bottom object-contain", style: { width: size, height: size } }, `${part}-${index}`));
            }
            return (_jsx(Fragment, { children: splitMentionedText(part, mentions).map((mentionPart, mentionIndex) => mentionPart.kind === "mention" ? (_jsx(Link, { to: `/up/${mentionPart.mid}`, className: "text-[#00AEEC] hover:underline", onClick: (event) => event.stopPropagation(), children: mentionPart.value }, `m-${index}-${mentionIndex}`)) : (_jsx(Fragment, { children: splitLinkifiedText(mentionPart.value).map((piece, pieceIndex) => piece.kind === "url" ? (_jsx(ExternalTextLink, { href: piece.href, children: piece.value }, `u-${index}-${mentionIndex}-${pieceIndex}`)) : piece.kind === "bvid" ? (_jsx(BvidTextLink, { bvid: piece.value }, `bv-${index}-${mentionIndex}-${pieceIndex}`)) : (_jsx(Fragment, { children: piece.value }, `p-${index}-${mentionIndex}-${pieceIndex}`))) }, `s-${index}-${mentionIndex}`))) }, `t-${index}`));
        }) }));
}
