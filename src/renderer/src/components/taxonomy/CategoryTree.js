import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen, Pencil, } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
function CategoryRow({ name, count, active, depth, expandable, expanded, onToggle, onClick, onRename, }) {
    return (_jsxs("div", { className: cn("group flex items-center gap-1 rounded-lg pr-1 transition-colors", active ? "bg-primary/10 text-primary" : "hover:bg-secondary"), style: { paddingLeft: `${depth * 12 + 8}px` }, children: [expandable ? (_jsx("button", { type: "button", onClick: onToggle, className: "shrink-0 rounded p-0.5 hover:bg-secondary", children: expanded ? (_jsx(ChevronDown, { className: "h-3.5 w-3.5" })) : (_jsx(ChevronRight, { className: "h-3.5 w-3.5" })) })) : (_jsx("span", { className: "w-4 shrink-0" })), _jsxs("button", { type: "button", onClick: onClick, className: "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left", children: [depth === 0 &&
                        (active ? (_jsx(FolderOpen, { className: "h-4 w-4 shrink-0" })) : (_jsx(Folder, { className: "h-4 w-4 shrink-0" }))), _jsx("span", { className: "truncate", children: name }), count != null && count > 0 && (_jsx("span", { className: "ml-auto shrink-0 text-xs text-muted-foreground", children: count }))] }), onRename && (_jsx("button", { type: "button", title: "\u7F16\u8F91\u540D\u79F0", onClick: (e) => {
                    e.stopPropagation();
                    onRename();
                }, className: "shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100", children: _jsx(Pencil, { className: "h-3 w-3" }) }))] }));
}
export function CategoryTree({ tree, selection, onSelect, onRename, allLabel = "全部收藏", allCount, showCollapseAll = false, }) {
    const [expandedL1, setExpandedL1] = useState(new Set(tree.map((n) => n.id)));
    const [expandedL2, setExpandedL2] = useState(new Set());
    const toggleL1 = (id) => {
        setExpandedL1((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const toggleL2 = (id) => {
        setExpandedL2((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const isActive = (level, id) => selection.level === level && selection.id === id;
    const allCollapsed = tree.every((node) => !expandedL1.has(node.id));
    const toggleAll = () => {
        if (allCollapsed) {
            setExpandedL1(new Set(tree.map((node) => node.id)));
        }
        else {
            setExpandedL1(new Set());
            setExpandedL2(new Set());
        }
    };
    return (_jsxs("div", { className: "space-y-0.5 text-sm", children: [_jsx(CategoryRow, { name: allLabel, ...(allCount != null ? { count: allCount } : {}), active: isActive("all", null), depth: 0, onClick: () => onSelect({ level: "all", id: null }) }), showCollapseAll && tree.length > 0 && (_jsxs("button", { type: "button", onClick: toggleAll, className: "flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground", title: allCollapsed ? "展开全部一级分类" : "折叠全部一级分类", children: [allCollapsed ? (_jsx(ChevronsUpDown, { className: "h-3 w-3" })) : (_jsx(ChevronsDownUp, { className: "h-3 w-3" })), allCollapsed ? "全部展开" : "全部折叠"] })), tree.map((l1) => (_jsxs("div", { children: [_jsx(CategoryRow, { name: l1.name, count: l1.count, active: isActive("l1", l1.id), depth: 0, expandable: true, expanded: expandedL1.has(l1.id), onToggle: () => toggleL1(l1.id), onClick: () => {
                            if (!expandedL1.has(l1.id))
                                toggleL1(l1.id);
                            onSelect({ level: "l1", id: l1.id });
                        }, onRename: onRename ? () => onRename("l1", l1.id, l1.name) : undefined }), expandedL1.has(l1.id) &&
                        l1.children.map((l2) => (_jsxs("div", { children: [_jsx(CategoryRow, { name: l2.name, count: l2.count, active: isActive("l2", l2.id), depth: 1, expandable: l2.children.length > 0, expanded: expandedL2.has(l2.id), onToggle: () => toggleL2(l2.id), onClick: () => {
                                        if (l2.children.length > 0 && !expandedL2.has(l2.id))
                                            toggleL2(l2.id);
                                        onSelect({ level: "l2", id: l2.id });
                                    }, onRename: onRename ? () => onRename("l2", l2.id, l2.name) : undefined }), expandedL2.has(l2.id) &&
                                    l2.children.map((l3) => (_jsx(CategoryRow, { name: l3.name, count: l3.count, active: isActive("l3", l3.id), depth: 2, onClick: () => onSelect({ level: "l3", id: l3.id }), onRename: onRename
                                            ? () => onRename("l3", l3.id, l3.name)
                                            : undefined }, l3.id)))] }, l2.id)))] }, l1.id)))] }));
}
