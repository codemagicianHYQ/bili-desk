import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { groupFavFolders, UNGROUPED_L1, } from "@shared/utils/fav-folder-groups";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Eraser, Folder, GripVertical, MoreHorizontal, Pencil, Trash2, } from "lucide-react";
function l1CollapseKeys(blocks) {
    const keys = [];
    for (const block of blocks) {
        if (block.kind === "l1")
            keys.push(`l1:${block.name}`);
        if (block.kind === "ungrouped")
            keys.push(`l1:${UNGROUPED_L1}`);
    }
    return keys;
}
function isL2Item(item) {
    return "kind" in item && item.kind === "l2";
}
function SectionRule({ title, count, collapsed, onToggle, nested = false, dropActive = false, onDragOver, onDrop, }) {
    return (_jsxs("button", { type: "button", onClick: onToggle, onDragOver: onDragOver, onDrop: onDrop, className: cn("flex w-full items-center gap-2 rounded-md py-1.5 text-left", nested ? "pl-3 pr-1" : "px-1", dropActive && "bg-primary/10 ring-1 ring-primary/70"), children: [_jsx(ChevronDown, { className: cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90") }), _jsx("span", { className: cn("shrink-0 font-medium text-muted-foreground", nested ? "text-[10px]" : "text-[11px]"), children: title }), _jsx("span", { className: "h-px min-w-2 flex-1 bg-border" }), _jsx("span", { className: "shrink-0 text-[10px] text-muted-foreground", children: count })] }));
}
export function FavFolderGroupedNav({ folders, groupOverrides = {}, selectedFolder, draggingFolderId, dropFolderId, dropEdge, dropGroupName, onSelect, onDragStart, onDragOver, onDrop, onDragOverGroup, onDropOnGroup, onDragEnd, shouldIgnoreClick, onEdit, onCleanInvalid, onDelete, }) {
    const { pinned, blocks } = groupFavFolders(folders, groupOverrides);
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [menuFolderId, setMenuFolderId] = useState(null);
    const menuRef = useRef(null);
    useEffect(() => {
        if (menuFolderId == null)
            return;
        const close = (event) => {
            if (menuRef.current?.contains(event.target))
                return;
            setMenuFolderId(null);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [menuFolderId]);
    const toggle = (key) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key))
                next.delete(key);
            else
                next.add(key);
            return next;
        });
    };
    const l1Keys = l1CollapseKeys(blocks);
    const allL1Collapsed = l1Keys.length > 0 && l1Keys.every((key) => collapsed.has(key));
    const toggleAllL1 = () => {
        setCollapsed((prev) => {
            if (allL1Collapsed) {
                const next = new Set(prev);
                for (const key of l1Keys)
                    next.delete(key);
                return next;
            }
            return new Set([...prev, ...l1Keys]);
        });
    };
    const renderFolderRow = (item, options) => {
        const folder = item.folder;
        const canDrag = options.canDrag && !folder.isDefault;
        const canDelete = canDrag;
        const dragging = draggingFolderId === folder.id;
        const dropTarget = dropFolderId === folder.id &&
            draggingFolderId != null &&
            draggingFolderId !== folder.id;
        return (_jsxs("div", { draggable: canDrag, onDragStart: (event) => onDragStart(event, folder), onDragOver: (event) => {
                event.preventDefault();
                onDragOver(event, folder.id);
            }, onDrop: (event) => {
                event.preventDefault();
                if (!canDrag)
                    return;
                onDrop(event, folder.id);
            }, onDragEnd: onDragEnd, className: cn("group relative flex items-center gap-0.5 rounded-lg", options.nested && "ml-2", dragging && "bg-primary/20 text-primary opacity-90", !dragging &&
                selectedFolder === folder.id &&
                "bg-primary/10 text-primary", !dragging &&
                selectedFolder !== folder.id &&
                "text-foreground hover:bg-secondary"), children: [dropTarget && (_jsxs("span", { "aria-hidden": true, className: cn("pointer-events-none absolute inset-x-1 z-10 flex items-center", dropEdge === "before" ? "-top-[3px]" : "-bottom-[3px]"), children: [_jsx("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-primary" }), _jsx("span", { className: "h-0.5 min-w-0 flex-1 rounded-full bg-primary" })] })), canDrag ? (_jsx("span", { className: "flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing", title: "\u62D6\u52A8\u6392\u5E8F", "aria-hidden": true, children: _jsx(GripVertical, { className: "h-3.5 w-3.5" }) })) : (_jsx("span", { className: "w-5 shrink-0" })), _jsxs("button", { type: "button", onClick: () => {
                        if (shouldIgnoreClick())
                            return;
                        onSelect(folder.id);
                    }, className: "flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm", children: [_jsx(Folder, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "min-w-0 flex-1 truncate", title: folder.title, children: item.label }), _jsx("span", { className: "shrink-0 text-xs text-muted-foreground", children: folder.mediaCount })] }), _jsxs("div", { className: "relative shrink-0", ref: menuFolderId === folder.id ? menuRef : undefined, children: [_jsx("button", { type: "button", draggable: false, title: "\u6536\u85CF\u5939\u64CD\u4F5C", "aria-label": "\u6536\u85CF\u5939\u64CD\u4F5C", onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setMenuFolderId((current) => current === folder.id ? null : folder.id);
                            }, className: cn("mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground", selectedFolder === folder.id || menuFolderId === folder.id
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"), children: _jsx(MoreHorizontal, { className: "h-3.5 w-3.5" }) }), menuFolderId === folder.id && (_jsxs("div", { "data-glass-panel": true, className: "bili-glass absolute right-1 top-8 z-20 min-w-36 overflow-hidden rounded-xl border border-border bg-card/40 py-1 shadow-2xl", children: [_jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary", onClick: (event) => {
                                        event.stopPropagation();
                                        setMenuFolderId(null);
                                        onEdit(folder);
                                    }, children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), "\u7F16\u8F91\u4FE1\u606F"] }), _jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary", onClick: (event) => {
                                        event.stopPropagation();
                                        setMenuFolderId(null);
                                        onCleanInvalid(folder);
                                    }, children: [_jsx(Eraser, { className: "h-3.5 w-3.5" }), "\u6E05\u9664\u5DF2\u5931\u6548"] }), canDelete && (_jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-secondary", onClick: (event) => {
                                        event.stopPropagation();
                                        setMenuFolderId(null);
                                        onDelete(folder);
                                    }, children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "\u5220\u9664\u6536\u85CF\u5939"] }))] }))] })] }, folder.id));
    };
    const renderBlock = (block) => {
        if (block.kind === "flat") {
            return renderFolderRow({ folder: block.folder, label: block.label }, { canDrag: true });
        }
        if (block.kind === "overflow") {
            return (_jsx("div", { className: "space-y-0.5", children: block.folders.map((item, index) => renderFolderRow(item, { canDrag: true, nested: index > 0 })) }, block.folders[0]?.folder.id));
        }
        if (block.kind === "ungrouped") {
            const count = block.folders.reduce((sum, item) => sum + item.folder.mediaCount, 0);
            const l1Collapsed = collapsed.has(`l1:${UNGROUPED_L1}`);
            return (_jsxs("div", { className: "pt-1", children: [_jsx(SectionRule, { title: UNGROUPED_L1, count: count, collapsed: l1Collapsed, onToggle: () => {
                            if (shouldIgnoreClick())
                                return;
                            toggle(`l1:${UNGROUPED_L1}`);
                        }, dropActive: dropGroupName === UNGROUPED_L1, onDragOver: (event) => {
                            event.preventDefault();
                            onDragOverGroup(event, UNGROUPED_L1);
                        }, onDrop: (event) => {
                            event.preventDefault();
                            onDropOnGroup(event, UNGROUPED_L1);
                        } }), !l1Collapsed && (_jsx("div", { className: "space-y-0.5", children: block.folders.map((item) => renderFolderRow(item, { canDrag: true, nested: true })) }))] }, "ungrouped"));
        }
        const l1Key = `l1:${block.name}`;
        const l1Collapsed = collapsed.has(l1Key);
        return (_jsxs("div", { className: "pt-1", children: [_jsx(SectionRule, { title: block.name, count: block.totalCount, collapsed: l1Collapsed, onToggle: () => toggle(l1Key), dropActive: dropGroupName === block.name, onDragOver: (event) => {
                        event.preventDefault();
                        onDragOverGroup(event, block.name);
                    }, onDrop: (event) => {
                        event.preventDefault();
                        onDropOnGroup(event, block.name);
                    } }), !l1Collapsed && (_jsx("div", { className: "space-y-0.5", children: block.items.map((item) => {
                        if (!isL2Item(item)) {
                            return renderFolderRow(item, { canDrag: true, nested: true });
                        }
                        const l2Key = `l2:${block.name}/${item.name}`;
                        const l2Collapsed = collapsed.has(l2Key);
                        const l2Count = item.folders.reduce((sum, entry) => sum + entry.folder.mediaCount, 0);
                        return (_jsxs("div", { children: [_jsx(SectionRule, { title: item.name, count: l2Count, collapsed: l2Collapsed, onToggle: () => toggle(l2Key), nested: true }), !l2Collapsed &&
                                    item.folders.map((entry) => renderFolderRow(entry, { canDrag: true, nested: true }))] }, l2Key));
                    }) }))] }, l1Key));
    };
    return (_jsxs("div", { className: "space-y-0.5", children: [pinned.map((folder) => renderFolderRow({ folder, label: folder.title }, { canDrag: false })), l1Keys.length > 0 && (_jsxs("button", { type: "button", onClick: toggleAllL1, className: "flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground", title: allL1Collapsed ? "展开全部一级分类" : "折叠全部一级分类", children: [allL1Collapsed ? (_jsx(ChevronsUpDown, { className: "h-3 w-3" })) : (_jsx(ChevronsDownUp, { className: "h-3 w-3" })), allL1Collapsed ? "全部展开" : "全部折叠"] })), blocks.map((block) => renderBlock(block))] }));
}
