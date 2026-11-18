import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen, GripVertical, Pencil, } from "lucide-react";
import { useState } from "react";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { cn } from "@/lib/utils";
function GroupRow({ name, count, active, depth, color, expandable, expanded, renaming, dropHint, draggable, onToggle, onClick, onDoubleClick, onRenameDone, onDragStart, onDragOver, onDrop, onDragEnd, }) {
    return (_jsxs("div", { draggable: draggable && !renaming, onDragStart: onDragStart, onDragOver: onDragOver, onDrop: onDrop, onDragEnd: onDragEnd, className: cn("group relative flex items-center gap-1 rounded-lg pr-1 transition-colors", active ? "bg-primary/10 text-primary" : "hover:bg-secondary", dropHint === "before" &&
            "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-primary", dropHint === "after" &&
            "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-primary"), style: { paddingLeft: `${depth * 12 + 8}px` }, title: onDoubleClick ? "双击或点铅笔重命名，拖动调整顺序" : undefined, children: [expandable ? (_jsx("button", { type: "button", onClick: onToggle, className: "shrink-0 rounded p-0.5 hover:bg-secondary", children: expanded ? (_jsx(ChevronDown, { className: "h-3.5 w-3.5" })) : (_jsx(ChevronRight, { className: "h-3.5 w-3.5" })) })) : (_jsx("span", { className: "w-4 shrink-0" })), _jsxs("div", { role: "button", tabIndex: 0, onClick: (event) => {
                    if (renaming || event.detail > 1)
                        return;
                    onClick();
                }, onDoubleClick: onDoubleClick, onKeyDown: (event) => {
                    if (renaming)
                        return;
                    if (event.key === "Enter")
                        onClick();
                    if (event.key === "F2")
                        onDoubleClick?.();
                }, className: "flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left text-sm", children: [depth === 0 ? (active ? (_jsx(FolderOpen, { className: "h-4 w-4 shrink-0", style: { color } })) : (_jsx(Folder, { className: "h-4 w-4 shrink-0", style: { color } }))) : (_jsx("span", { className: "h-2.5 w-2.5 shrink-0 rounded-full", style: { backgroundColor: color ?? "#94a3b8" } })), renaming && onRenameDone ? (_jsx(InlineRenameInput, { initial: name, maxLength: 20, onDone: onRenameDone })) : (_jsx("span", { className: "truncate", children: name })), !renaming && count != null && count > 0 && (_jsx("span", { className: "ml-auto shrink-0 text-xs text-muted-foreground", children: count }))] }), onDoubleClick && !renaming && (_jsx("button", { type: "button", title: "\u91CD\u547D\u540D", onClick: (event) => {
                    event.stopPropagation();
                    onDoubleClick();
                }, className: "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100", children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) })), draggable && !renaming && (_jsx(GripVertical, { className: "h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60" }))] }));
}
export function UpGroupTree({ tree, selection, uncategorizedCount, onSelect, onRename, onReorder, }) {
    const [expandedL1, setExpandedL1] = useState(new Set(tree.map((node) => node.id)));
    const [renamingId, setRenamingId] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
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
    const allCollapsed = tree.every((node) => !expandedL1.has(node.id));
    const toggleAll = () => setExpandedL1(allCollapsed ? new Set(tree.map((node) => node.id)) : new Set());
    const isActive = (level, id) => selection.level === level && selection.id === id;
    const finishRename = (id, oldName, value) => {
        setRenamingId(null);
        if (value && value !== oldName)
            onRename?.(id, value);
    };
    const siblingsOf = (parentId) => parentId == null
        ? tree
        : (tree.find((node) => node.id === parentId)?.children ?? []);
    const reorder = (ids) => {
        if (ids.length > 1)
            onReorder?.([ids]);
    };
    const sortSiblings = (by) => {
        const compare = (a, b) => by === "count"
            ? b.count - a.count || a.name.localeCompare(b.name, "zh-CN")
            : a.name.localeCompare(b.name, "zh-CN");
        const orders = [
            [...tree].sort(compare).map((node) => node.id),
            ...tree.map((node) => [...node.children].sort(compare).map((child) => child.id)),
        ].filter((ids) => ids.length > 1);
        if (orders.length > 0)
            onReorder?.(orders);
    };
    const dragProps = (id, parentId) => {
        if (!onReorder)
            return {};
        return {
            draggable: true,
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(id));
                setDragging({ id, parentId });
            },
            onDragOver: (event) => {
                if (!dragging || dragging.parentId !== parentId || dragging.id === id)
                    return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                setDropTarget((prev) => prev?.id === id && prev.after === after ? prev : { id, after });
            },
            onDrop: (event) => {
                event.preventDefault();
                if (!dragging || dragging.parentId !== parentId || !dropTarget)
                    return;
                const ids = siblingsOf(parentId)
                    .map((node) => node.id)
                    .filter((value) => value !== dragging.id);
                const index = ids.indexOf(dropTarget.id);
                if (index >= 0)
                    ids.splice(dropTarget.after ? index + 1 : index, 0, dragging.id);
                reorder(ids);
                setDragging(null);
                setDropTarget(null);
            },
            onDragEnd: () => {
                setDragging(null);
                setDropTarget(null);
            },
        };
    };
    const hintFor = (id) => dropTarget?.id === id ? (dropTarget.after ? "after" : "before") : null;
    return (_jsxs("div", { className: "space-y-0.5", children: [tree.length > 0 && (_jsxs("div", { className: "flex items-center gap-0.5 px-1 pb-1 text-[11px] text-muted-foreground", children: [_jsxs("button", { type: "button", onClick: toggleAll, className: "flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground", title: allCollapsed ? "展开全部一级分组" : "折叠全部一级分组", children: [allCollapsed ? (_jsx(ChevronsUpDown, { className: "h-3 w-3" })) : (_jsx(ChevronsDownUp, { className: "h-3 w-3" })), allCollapsed ? "全部展开" : "全部折叠"] }), onReorder && (_jsxs(_Fragment, { children: [_jsx("span", { className: "ml-auto", children: "\u6392\u5E8F" }), _jsx("button", { type: "button", onClick: () => sortSiblings("count"), className: "rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground", title: "\u4E00\u7EA7\u3001\u4E8C\u7EA7\u5206\u7EC4\u90FD\u6309 UP \u6570\u91CF\u4ECE\u591A\u5230\u5C11\u6392", children: "\u6570\u91CF" }), _jsx("button", { type: "button", onClick: () => sortSiblings("name"), className: "rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground", title: "\u4E00\u7EA7\u3001\u4E8C\u7EA7\u5206\u7EC4\u90FD\u6309\u540D\u79F0\u6392", children: "\u540D\u79F0" })] }))] })), _jsx(GroupRow, { name: "\u672A\u5206\u7EC4", count: uncategorizedCount, active: isActive("uncategorized", null), depth: 0, onClick: () => onSelect({ level: "uncategorized", id: null }) }), tree.map((l1) => (_jsxs("div", { children: [_jsx(GroupRow, { name: l1.name, count: l1.count, active: isActive("l1", l1.id), depth: 0, color: l1.color, expandable: true, expanded: expandedL1.has(l1.id), renaming: renamingId === l1.id, dropHint: hintFor(l1.id), onToggle: () => toggleL1(l1.id), onClick: () => {
                            if (!expandedL1.has(l1.id))
                                toggleL1(l1.id);
                            onSelect({ level: "l1", id: l1.id });
                        }, ...(onRename
                            ? {
                                onDoubleClick: () => setRenamingId(l1.id),
                                onRenameDone: (value) => finishRename(l1.id, l1.name, value),
                            }
                            : {}), ...dragProps(l1.id, null) }), expandedL1.has(l1.id) &&
                        l1.children.map((l2) => (_jsx(GroupRow, { name: l2.name, count: l2.count, active: isActive("l2", l2.id), depth: 1, color: l2.color, renaming: renamingId === l2.id, dropHint: hintFor(l2.id), onClick: () => onSelect({ level: "l2", id: l2.id }), ...(onRename
                                ? {
                                    onDoubleClick: () => setRenamingId(l2.id),
                                    onRenameDone: (value) => finishRename(l2.id, l2.name, value),
                                }
                                : {}), ...dragProps(l2.id, l1.id) }, l2.id)))] }, l1.id)))] }));
}
