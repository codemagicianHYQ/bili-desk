import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileX2, ShieldAlert } from "lucide-react";
import { describeBiliFailure } from "@shared/bili-error";
export function ErrorState({ error, hint, fallback, action, className = "h-full", }) {
    const copy = describeBiliFailure(error, hint, fallback);
    const blocked = /安全策略|风控|频繁|登录/.test(copy.title);
    const Icon = blocked ? ShieldAlert : FileX2;
    return (_jsx("div", { className: `flex items-center justify-center px-6 py-16 ${className}`, children: _jsxs("div", { className: "w-full max-w-sm rounded-2xl border border-border/80 bg-card/70 px-8 py-10 text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground", children: _jsx(Icon, { className: "h-7 w-7", strokeWidth: 1.6 }) }), _jsx("h2", { className: "text-base font-semibold tracking-tight text-foreground", children: copy.title }), copy.detail && copy.detail !== copy.title ? (_jsx("p", { className: "mt-2 text-sm leading-relaxed text-muted-foreground", children: copy.detail })) : null, action ? (_jsx("div", { className: "mt-5 flex justify-center", children: action })) : null] }) }));
}
export function ContentUnavailable({ kind, error, }) {
    return (_jsx(ErrorState, { error: error, hint: kind, fallback: kind === "video"
            ? "视频信息获取失败，请稍后重试。"
            : "动态加载失败，请稍后重试。" }));
}
