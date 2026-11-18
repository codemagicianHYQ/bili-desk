import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
export function officialKind(type, desc) {
    if (type == null && !desc)
        return null;
    const resolved = type === 1 ? 1 : 0;
    return {
        type: resolved,
        desc: desc?.trim() ?? "",
        label: resolved === 1 ? "bilibili机构认证" : "bilibili个人认证",
        org: resolved === 1,
    };
}
export function OfficialVerifyBadge({ type, size = "sm", }) {
    const org = type === 1;
    return (_jsx("span", { className: cn("absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-background", org ? "bg-sky-500" : "bg-amber-400", size === "md" ? "h-6 w-6" : "h-4 w-4"), title: org ? "机构认证" : "个人认证", children: _jsx(Zap, { className: cn("fill-white text-white", size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5") }) }));
}
export function OfficialVerifyLine({ type, desc, }) {
    const kind = officialKind(type, desc);
    if (!kind)
        return null;
    return (_jsxs("p", { className: cn("flex min-w-0 items-center gap-1 text-xs", kind.org ? "text-sky-500" : "text-amber-500"), children: [_jsx(Zap, { className: "h-3 w-3 shrink-0 fill-current" }), _jsx("span", { className: "truncate", children: kind.desc ? `${kind.label}：${kind.desc}` : kind.label })] }));
}
