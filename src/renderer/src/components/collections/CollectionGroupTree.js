import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { UNGROUPED_COLLECTION_L1, collectionGroupKey, } from "@shared/utils/collection-groups";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, Inbox, Layers, } from "lucide-react";
export function buildCollectionTree(items, groups) {
    const l1Map = new Map();
    let ungrouped = 0;
    for (const item of items) {
        const group = groups[collectionGroupKey(item)];
        if (!group) {
            ungrouped++;
            continue;
        }
        const l2Map = l1Map.get(group.l1) ?? new Map();
        l2Map.set(group.l2, (l2Map.get(group.l2) ?? 0) + 1);
        l1Map.set(group.l1, l2Map);
    }
    const tree = Array.from(l1Map, ([name, l2Map]) => {
        const children = Array.from(l2Map, ([l2, count]) => ({
            name: l2,
            count,
        })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return {
            name,
            count: children.reduce((sum, child) => sum + child.count, 0),
            children,
        };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { tree, ungrouped };
}
/** 不依赖合集列表，直接由已保存的分类生成目录（移动弹窗用） */
export function buildTreeFromGroups(groups) {
    const fake = Object.keys(groups).map((key) => {
        const [kind, id] = key.split(":");
        return { kind, id: Number(id) };
    });
    return buildCollectionTree(fake, groups).tree;
}
export function matchesCollectionSelection(item, groups, selection) {
    if (selection.l1 == null)
        return true;
    const group = groups[collectionGroupKey(item)];
    if (selection.l1 === UNGROUPED_COLLECTION_L1)
        return !group;
    if (!group || group.l1 !== selection.l1)
        return false;
    return selection.l2 == null || group.l2 === selection.l2;
}
function RenameInput({ initial, onDone, }) {
    const [value, setValue] = useState(initial);
    return (_jsx("input", { autoFocus: true, value: value, onChange: (event) => setValue(event.target.value), onClick: (event) => event.stopPropagation(), onBlur: () => onDone(value.trim() || null), onKeyDown: (event) => {
            if (event.key === "Enter")
                onDone(value.trim() || null);
            if (event.key === "Escape")
                onDone(null);
        }, className: "min-w-0 flex-1 rounded border border-primary/50 bg-background px-1 text-sm outline-none" }));
}
export function CollectionGroupTree({ tree, total, ungrouped, selection, onSelect, onRename, }) {
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [renaming, setRenaming] = useState(null);
    const rowClass = (active) => cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors", active ? "bg-primary/10 text-primary" : "hover:bg-secondary");
    const toggle = (name) => setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(name))
            next.delete(name);
        else
            next.add(name);
        return next;
    });
    const allCollapsed = tree.every((l1) => collapsed.has(l1.name));
    const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(tree.map((l1) => l1.name)));
    return (_jsxs("div", { className: "space-y-0.5", children: [_jsxs("button", { type: "button", className: rowClass(selection.l1 == null), onClick: () => onSelect({ l1: null, l2: null }), children: [_jsx(Layers, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "flex-1", children: "\u5168\u90E8\u5408\u96C6" }), _jsx("span", { className: "text-xs text-muted-foreground", children: total })] }), tree.length > 0 && (_jsxs("button", { type: "button", onClick: toggleAll, className: "flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground", title: allCollapsed ? "展开全部一级分类" : "折叠全部一级分类", children: [allCollapsed ? (_jsx(ChevronsUpDown, { className: "h-3 w-3" })) : (_jsx(ChevronsDownUp, { className: "h-3 w-3" })), allCollapsed ? "全部展开" : "全部折叠"] })), tree.map((l1) => {
                const open = !collapsed.has(l1.name);
                const l1Key = `l1:${l1.name}`;
                return (_jsxs("div", { children: [_jsxs("div", { role: "button", tabIndex: 0, className: cn(rowClass(selection.l1 === l1.name && selection.l2 == null), "font-medium"), onClick: () => onSelect({ l1: l1.name, l2: null }), onDoubleClick: () => setRenaming(l1Key), title: "\u53CC\u51FB\u91CD\u547D\u540D", children: [_jsx("span", { className: "-ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground", onClick: (event) => {
                                        event.stopPropagation();
                                        toggle(l1.name);
                                    }, children: open ? (_jsx(ChevronDown, { className: "h-3.5 w-3.5" })) : (_jsx(ChevronRight, { className: "h-3.5 w-3.5" })) }), renaming === l1Key ? (_jsx(RenameInput, { initial: l1.name, onDone: (value) => {
                                        setRenaming(null);
                                        if (value && value !== l1.name)
                                            onRename(l1.name, null, value);
                                    } })) : (_jsx("span", { className: "min-w-0 flex-1 truncate", children: l1.name })), _jsx("span", { className: "text-xs font-normal text-muted-foreground", children: l1.count })] }), open && (_jsx("div", { className: "ml-3 space-y-0.5 border-l border-border/60 pl-2", children: l1.children.map((l2) => {
                                const l2Key = `l2:${l1.name}/${l2.name}`;
                                return (_jsxs("div", { role: "button", tabIndex: 0, className: rowClass(selection.l1 === l1.name && selection.l2 === l2.name), onClick: () => onSelect({ l1: l1.name, l2: l2.name }), onDoubleClick: () => setRenaming(l2Key), title: "\u53CC\u51FB\u91CD\u547D\u540D", children: [_jsx(Folder, { className: "h-3.5 w-3.5 shrink-0 opacity-70" }), renaming === l2Key ? (_jsx(RenameInput, { initial: l2.name, onDone: (value) => {
                                                setRenaming(null);
                                                if (value && value !== l2.name)
                                                    onRename(l1.name, l2.name, value);
                                            } })) : (_jsx("span", { className: "min-w-0 flex-1 truncate", children: l2.name })), _jsx("span", { className: "text-xs text-muted-foreground", children: l2.count })] }, l2.name));
                            }) }))] }, l1.name));
            }), ungrouped > 0 && (_jsxs("button", { type: "button", className: rowClass(selection.l1 === UNGROUPED_COLLECTION_L1), onClick: () => onSelect({ l1: UNGROUPED_COLLECTION_L1, l2: null }), children: [_jsx(Inbox, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "flex-1", children: UNGROUPED_COLLECTION_L1 }), _jsx("span", { className: "text-xs text-muted-foreground", children: ungrouped })] }))] }));
}
