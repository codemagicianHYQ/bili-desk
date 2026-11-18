import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
export function UpGroupPanel({ groups, selectedId, onSelect }) {
    return (_jsx("div", { className: "space-y-1", children: groups.map((group) => (_jsxs("button", { type: "button", onClick: () => onSelect?.(group.id), className: cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors', selectedId === group.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'), children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-2.5 w-2.5 rounded-full", style: { backgroundColor: group.color } }), group.name] }), _jsxs("span", { className: "flex items-center gap-2", children: [group.isAiGenerated && _jsx(Badge, { variant: "ai", children: "AI" }), _jsx("span", { className: "text-xs text-muted-foreground", children: group.memberCount })] })] }, group.id))) }));
}
