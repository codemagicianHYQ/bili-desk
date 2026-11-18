import { jsx as _jsx } from "react/jsx-runtime";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { openBiliHref } from "@/lib/open-bili-href";
import { isBiliShortUrl, isBiliUrl } from "@shared/utils/bili-app-link";
import { normalizeBvid, splitLinkifiedText } from "@shared/utils/external-url";
export function ExternalTextLink({ href, children, className, }) {
    const navigate = useNavigate();
    const biliLink = isBiliUrl(href) || isBiliShortUrl(href);
    const handleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openBiliHref(href, navigate);
    };
    return (_jsx("a", { href: href, target: "_blank", rel: "noreferrer noopener", className: cn("break-all underline-offset-2 hover:underline", biliLink ? "text-[#00AEEC]" : "text-primary", className), onClick: handleClick, children: children }));
}
export function BvidTextLink({ bvid, className, }) {
    const id = normalizeBvid(bvid);
    return (_jsx(Link, { to: `/video/${id}`, className: cn("break-all font-medium text-[#00AEEC] underline-offset-2 hover:underline", className), onClick: (event) => event.stopPropagation(), children: bvid }));
}
export function LinkifiedText({ text, className, }) {
    const parts = splitLinkifiedText(text);
    return (_jsx("span", { className: cn("whitespace-pre-wrap break-words", className), children: parts.map((part, index) => part.kind === "url" ? (_jsx(ExternalTextLink, { href: part.href, children: part.value }, `u-${index}`)) : part.kind === "bvid" ? (_jsx(BvidTextLink, { bvid: part.value }, `bv-${index}`)) : (_jsx("span", { children: part.value }, `t-${index}`))) }));
}
