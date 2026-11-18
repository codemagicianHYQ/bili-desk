import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Folder, GripVertical, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
const ORDER_STORAGE_KEY = "bilidesk:follow-tag-order";
function readOrder() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
    }
    catch {
        return [];
    }
}
function writeOrder(ids) {
    if (ids)
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids));
    else
        localStorage.removeItem(ORDER_STORAGE_KEY);
}
/** 官方没有分组排序接口，顺序只记在本机；新建的分组排在最后 */
function applyOrder(tags, order) {
    if (order.length === 0)
        return tags;
    const rank = new Map(order.map((id, index) => [id, index]));
    return tags
        .map((tag, index) => ({ tag, index }))
        .sort((a, b) => (rank.get(a.tag.tagId) ?? order.length + a.index) -
        (rank.get(b.tag.tagId) ?? order.length + b.index))
        .map((entry) => entry.tag);
}
export function FollowTagList({ tags, selectedTagId, onSelect, onRenamed, onDeleted, onMessage, }) {
    const [order, setOrder] = useState(readOrder);
    const [renamingId, setRenamingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
    const ordered = useMemo(() => applyOrder(tags, order), [tags, order]);
    const saveOrder = (ids) => {
        writeOrder(ids);
        setOrder(ids ?? []);
    };
    const sortBy = (by) => {
        if (by === "official") {
            saveOrder(null);
            return;
        }
        const sorted = [...tags].sort((a, b) => by === "count"
            ? b.count - a.count || a.name.localeCompare(b.name, "zh-CN")
            : a.name.localeCompare(b.name, "zh-CN"));
        saveOrder(sorted.map((tag) => tag.tagId));
    };
    const rename = async (tag, value) => {
        setRenamingId(null);
        if (!value || value === tag.name)
            return;
        try {
            await window.biliDesk.bili.renameFollowTag(tag.tagId, value);
            onRenamed(tag.tagId, value);
            onMessage(`已把分组「${tag.name}」改名为「${value}」`);
        }
        catch (err) {
            onMessage(extractIpcErrorMessage(err) || "重命名失败");
        }
    };
    const confirmDelete = async () => {
        const tag = deleteTarget;
        if (!tag || deleting)
            return;
        setDeleting(true);
        try {
            await window.biliDesk.bili.deleteFollowTag(tag.tagId);
            onDeleted(tag.tagId);
            onMessage(`已删除分组「${tag.name}」，组内 UP 回到默认分组`);
            setDeleteTarget(null);
        }
        catch (err) {
            onMessage(extractIpcErrorMessage(err) || "删除分组失败");
        }
        finally {
            setDeleting(false);
        }
    };
    const onDragOver = (event, tagId) => {
        if (draggingId == null || draggingId === tagId)
            return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        setDropTarget((prev) => prev?.id === tagId && prev.after === after ? prev : { id: tagId, after });
    };
    const onDrop = (event) => {
        event.preventDefault();
        if (draggingId == null || !dropTarget)
            return;
        const ids = ordered
            .map((tag) => tag.tagId)
            .filter((id) => id !== draggingId);
        const index = ids.indexOf(dropTarget.id);
        if (index >= 0) {
            ids.splice(dropTarget.after ? index + 1 : index, 0, draggingId);
            saveOrder(ids);
        }
        setDraggingId(null);
        setDropTarget(null);
    };
    if (tags.length === 0) {
        return (_jsx("p", { className: "px-2 py-4 text-center text-xs text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u540C\u6B65 B \u7AD9\u5173\u6CE8\u5206\u7EC4" }));
    }
    return (_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex items-center gap-0.5 px-1 pb-1 text-[11px] text-muted-foreground", children: [_jsx("span", { className: "px-1", children: "\u6392\u5E8F" }), [
                        ["count", "数量"],
                        ["name", "名称"],
                        ["official", "官方顺序"],
                    ].map(([value, label]) => (_jsx("button", { type: "button", onClick: () => sortBy(value), className: cn("rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground", value === "official" && order.length === 0 && "text-primary"), children: label }, value)))] }), ordered.map((tag) => {
                const editable = tag.tagId > 0;
                const renaming = renamingId === tag.tagId;
                const hint = dropTarget?.id === tag.tagId ? dropTarget : null;
                return (_jsxs("div", { role: "button", tabIndex: 0, draggable: !renaming, onDragStart: (event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(tag.tagId));
                        setDraggingId(tag.tagId);
                    }, onDragOver: (event) => onDragOver(event, tag.tagId), onDrop: onDrop, onDragEnd: () => {
                        setDraggingId(null);
                        setDropTarget(null);
                    }, onClick: (event) => {
                        if (renaming || event.detail > 1)
                            return;
                        onSelect(tag.tagId);
                    }, onDoubleClick: () => editable && setRenamingId(tag.tagId), onKeyDown: (event) => {
                        if (renaming)
                            return;
                        if (event.key === "Enter")
                            onSelect(tag.tagId);
                        if (event.key === "F2" && editable)
                            setRenamingId(tag.tagId);
                    }, title: editable
                        ? "双击或点铅笔重命名，拖动调整顺序"
                        : "系统分组不能改名，可拖动调整顺序", className: cn("group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors", selectedTagId === tag.tagId
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-secondary", hint &&
                        !hint.after &&
                        "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-primary", hint?.after &&
                        "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-primary"), children: [_jsx(Folder, { className: "h-4 w-4 shrink-0" }), renaming ? (_jsx(InlineRenameInput, { initial: tag.name, maxLength: 16, onDone: (value) => void rename(tag, value) })) : (_jsx("span", { className: "min-w-0 flex-1 truncate", children: tag.name })), !renaming && editable && (_jsx("button", { type: "button", className: "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100", title: "\u91CD\u547D\u540D", onClick: (event) => {
                                event.stopPropagation();
                                setRenamingId(tag.tagId);
                            }, children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) })), !renaming && editable && (_jsx("button", { type: "button", className: "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-red-400 group-hover:opacity-100", title: "\u5220\u9664\u5206\u7EC4", onClick: (event) => {
                                event.stopPropagation();
                                setDeleteTarget(tag);
                            }, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })), !renaming && (_jsx("span", { className: "shrink-0 text-xs text-muted-foreground", children: tag.count })), !renaming && (_jsx(GripVertical, { className: "h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60" }))] }, tag.tagId));
            }), _jsx(ConfirmDialog, { open: deleteTarget != null, title: `删除分组「${deleteTarget?.name ?? ""}」？`, description: "\u53EA\u5220\u9664\u5206\u7EC4\u672C\u8EAB\uFF0C\u4E0D\u4F1A\u53D6\u6D88\u5173\u6CE8\uFF1B\u7EC4\u5185 UP \u4F1A\u56DE\u5230\u9ED8\u8BA4\u5206\u7EC4\u3002\u8FD9\u4E2A\u64CD\u4F5C\u4F1A\u540C\u6B65\u5230 B \u7AD9\u3002", confirmLabel: "\u5220\u9664", destructive: true, loading: deleting, onConfirm: () => void confirmDelete(), onCancel: () => {
                    if (!deleting)
                        setDeleteTarget(null);
                } })] }));
}
