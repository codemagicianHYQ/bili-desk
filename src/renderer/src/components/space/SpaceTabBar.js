import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
function formatTabCount(count) {
    if (count > 999)
        return "999+";
    return String(count);
}
export function SpaceTabBar({ tabs, value, onChange, className, }) {
    return (_jsx("div", { className: cn("scrollbar-none flex items-end gap-8 overflow-x-auto overflow-y-hidden border-b border-border", className), children: tabs.map((item) => {
            const active = item.id === value;
            const Icon = item.icon;
            return (_jsxs("button", { type: "button", onClick: () => onChange(item.id), className: cn("relative shrink-0 px-1 pb-3 pt-2.5 text-sm transition-colors", active
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground"), children: [_jsxs("span", { className: "inline-flex items-center gap-1", children: [Icon ? _jsx(Icon, { className: "h-4 w-4" }) : null, item.label, item.count != null && item.count > 0 ? (_jsx("span", { className: "text-xs tabular-nums", children: formatTabCount(item.count) })) : null] }), _jsx("span", { "aria-hidden": true, className: cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0") })] }, item.id));
        }) }));
}
