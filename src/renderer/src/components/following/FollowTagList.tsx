import { useMemo, useState, type DragEvent } from "react";
import { Folder, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { FollowTag } from "@shared/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";

const ORDER_STORAGE_KEY = "bilidesk:follow-tag-order";

function readOrder(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function writeOrder(ids: number[] | null): void {
  if (ids) localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids));
  else localStorage.removeItem(ORDER_STORAGE_KEY);
}

/** 官方没有分组排序接口，顺序只记在本机；新建的分组排在最后 */
function applyOrder(tags: FollowTag[], order: number[]): FollowTag[] {
  if (order.length === 0) return tags;
  const rank = new Map(order.map((id, index) => [id, index]));
  return tags
    .map((tag, index) => ({ tag, index }))
    .sort(
      (a, b) =>
        (rank.get(a.tag.tagId) ?? order.length + a.index) -
        (rank.get(b.tag.tagId) ?? order.length + b.index),
    )
    .map((entry) => entry.tag);
}

interface FollowTagListProps {
  tags: FollowTag[];
  selectedTagId: number | null;
  onSelect: (tagId: number) => void;
  onRenamed: (tagId: number, name: string) => void;
  onDeleted: (tagId: number) => void;
  onMessage: (message: string) => void;
}

export function FollowTagList({
  tags,
  selectedTagId,
  onSelect,
  onRenamed,
  onDeleted,
  onMessage,
}: FollowTagListProps) {
  const [order, setOrder] = useState<number[]>(readOrder);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowTag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: number;
    after: boolean;
  } | null>(null);

  const ordered = useMemo(() => applyOrder(tags, order), [tags, order]);

  const saveOrder = (ids: number[] | null) => {
    writeOrder(ids);
    setOrder(ids ?? []);
  };

  const sortBy = (by: "count" | "name" | "official") => {
    if (by === "official") {
      saveOrder(null);
      return;
    }
    const sorted = [...tags].sort((a, b) =>
      by === "count"
        ? b.count - a.count || a.name.localeCompare(b.name, "zh-CN")
        : a.name.localeCompare(b.name, "zh-CN"),
    );
    saveOrder(sorted.map((tag) => tag.tagId));
  };

  const rename = async (tag: FollowTag, value: string | null) => {
    setRenamingId(null);
    if (!value || value === tag.name) return;
    try {
      await window.biliDesk.bili.renameFollowTag(tag.tagId, value);
      onRenamed(tag.tagId, value);
      onMessage(`已把分组「${tag.name}」改名为「${value}」`);
    } catch (err) {
      onMessage(extractIpcErrorMessage(err) || "重命名失败");
    }
  };

  const confirmDelete = async () => {
    const tag = deleteTarget;
    if (!tag || deleting) return;
    setDeleting(true);
    try {
      await window.biliDesk.bili.deleteFollowTag(tag.tagId);
      onDeleted(tag.tagId);
      onMessage(`已删除分组「${tag.name}」，组内 UP 回到默认分组`);
      setDeleteTarget(null);
    } catch (err) {
      onMessage(extractIpcErrorMessage(err) || "删除分组失败");
    } finally {
      setDeleting(false);
    }
  };

  const onDragOver = (event: DragEvent, tagId: number) => {
    if (draggingId == null || draggingId === tagId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropTarget((prev) =>
      prev?.id === tagId && prev.after === after ? prev : { id: tagId, after },
    );
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (draggingId == null || !dropTarget) return;
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
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        登录后可同步 B 站关注分组
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-0.5 px-1 pb-1 text-[11px] text-muted-foreground">
        <span className="px-1">排序</span>
        {(
          [
            ["count", "数量"],
            ["name", "名称"],
            ["official", "官方顺序"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => sortBy(value)}
            className={cn(
              "rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground",
              value === "official" && order.length === 0 && "text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {ordered.map((tag) => {
        const editable = tag.tagId > 0;
        const renaming = renamingId === tag.tagId;
        const hint = dropTarget?.id === tag.tagId ? dropTarget : null;
        return (
          <div
            key={tag.tagId}
            role="button"
            tabIndex={0}
            draggable={!renaming}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(tag.tagId));
              setDraggingId(tag.tagId);
            }}
            onDragOver={(event) => onDragOver(event, tag.tagId)}
            onDrop={onDrop}
            onDragEnd={() => {
              setDraggingId(null);
              setDropTarget(null);
            }}
            onClick={(event) => {
              if (renaming || event.detail > 1) return;
              onSelect(tag.tagId);
            }}
            onDoubleClick={() => editable && setRenamingId(tag.tagId)}
            onKeyDown={(event) => {
              if (renaming) return;
              if (event.key === "Enter") onSelect(tag.tagId);
              if (event.key === "F2" && editable) setRenamingId(tag.tagId);
            }}
            title={
              editable
                ? "双击或点铅笔重命名，拖动调整顺序"
                : "系统分组不能改名，可拖动调整顺序"
            }
            className={cn(
              "group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
              selectedTagId === tag.tagId
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-secondary",
              hint &&
                !hint.after &&
                "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-primary",
              hint?.after &&
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-primary",
            )}
          >
            <Folder className="h-4 w-4 shrink-0" />
            {renaming ? (
              <InlineRenameInput
                initial={tag.name}
                maxLength={16}
                onDone={(value) => void rename(tag, value)}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            )}
            {!renaming && editable && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
                title="重命名"
                onClick={(event) => {
                  event.stopPropagation();
                  setRenamingId(tag.tagId);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!renaming && editable && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-red-400 group-hover:opacity-100"
                title="删除分组"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(tag);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {!renaming && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {tag.count}
              </span>
            )}
            {!renaming && (
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60" />
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={deleteTarget != null}
        title={`删除分组「${deleteTarget?.name ?? ""}」？`}
        description="只删除分组本身，不会取消关注；组内 UP 会回到默认分组。这个操作会同步到 B 站。"
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
