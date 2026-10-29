import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  GripVertical,
  Pencil,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import type {
  UpGroupSelection,
  UpGroupSelectionLevel,
  UpGroupTreeNode,
} from "@shared/types";
import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { cn } from "@/lib/utils";

interface UpGroupTreeProps {
  tree: UpGroupTreeNode[];
  selection: UpGroupSelection;
  uncategorizedCount?: number;
  onSelect: (selection: UpGroupSelection) => void;
  onRename?: (id: number, name: string) => void;
  /** 每个数组是同一父级下的新顺序 */
  onReorder?: (orders: number[][]) => void;
}

type DragItem = { id: number; parentId: number | null };

function GroupRow({
  name,
  count,
  active,
  depth,
  color,
  expandable,
  expanded,
  renaming,
  dropHint,
  draggable,
  onToggle,
  onClick,
  onDoubleClick,
  onRenameDone,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  name: string;
  count?: number;
  active: boolean;
  depth: number;
  color?: string;
  expandable?: boolean;
  expanded?: boolean;
  renaming?: boolean;
  dropHint?: "before" | "after" | null;
  draggable?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onDoubleClick?: () => void;
  onRenameDone?: (value: string | null) => void;
  onDragStart?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={draggable && !renaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex items-center gap-1 rounded-lg pr-1 transition-colors",
        active ? "bg-primary/10 text-primary" : "hover:bg-secondary",
        dropHint === "before" &&
          "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-primary",
        dropHint === "after" &&
          "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-primary",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      title={onDoubleClick ? "双击或点铅笔重命名，拖动调整顺序" : undefined}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 hover:bg-secondary"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if (renaming || event.detail > 1) return;
          onClick();
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === "Enter") onClick();
          if (event.key === "F2") onDoubleClick?.();
        }}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left text-sm"
      >
        {depth === 0 ? (
          active ? (
            <FolderOpen className="h-4 w-4 shrink-0" style={{ color }} />
          ) : (
            <Folder className="h-4 w-4 shrink-0" style={{ color }} />
          )
        ) : (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color ?? "#94a3b8" }}
          />
        )}
        {renaming && onRenameDone ? (
          <InlineRenameInput
            initial={name}
            maxLength={20}
            onDone={onRenameDone}
          />
        ) : (
          <span className="truncate">{name}</span>
        )}
        {!renaming && count != null && count > 0 && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {onDoubleClick && !renaming && (
        <button
          type="button"
          title="重命名"
          onClick={(event) => {
            event.stopPropagation();
            onDoubleClick();
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {draggable && !renaming && (
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60" />
      )}
    </div>
  );
}

export function UpGroupTree({
  tree,
  selection,
  uncategorizedCount,
  onSelect,
  onRename,
  onReorder,
}: UpGroupTreeProps) {
  const [expandedL1, setExpandedL1] = useState<Set<number>>(
    new Set(tree.map((node) => node.id)),
  );
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: number;
    after: boolean;
  } | null>(null);

  const toggleL1 = (id: number) => {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allCollapsed = tree.every((node) => !expandedL1.has(node.id));
  const toggleAll = () =>
    setExpandedL1(
      allCollapsed ? new Set(tree.map((node) => node.id)) : new Set(),
    );

  const isActive = (level: UpGroupSelectionLevel, id: number | null) =>
    selection.level === level && selection.id === id;

  const finishRename = (id: number, oldName: string, value: string | null) => {
    setRenamingId(null);
    if (value && value !== oldName) onRename?.(id, value);
  };

  const siblingsOf = (parentId: number | null) =>
    parentId == null
      ? tree
      : (tree.find((node) => node.id === parentId)?.children ?? []);

  const reorder = (ids: number[]) => {
    if (ids.length > 1) onReorder?.([ids]);
  };

  const sortSiblings = (by: "count" | "name") => {
    const compare = (
      a: { name: string; count: number },
      b: { name: string; count: number },
    ) =>
      by === "count"
        ? b.count - a.count || a.name.localeCompare(b.name, "zh-CN")
        : a.name.localeCompare(b.name, "zh-CN");
    const orders = [
      [...tree].sort(compare).map((node) => node.id),
      ...tree.map((node) =>
        [...node.children].sort(compare).map((child) => child.id),
      ),
    ].filter((ids) => ids.length > 1);
    if (orders.length > 0) onReorder?.(orders);
  };

  const dragProps = (id: number, parentId: number | null) => {
    if (!onReorder) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(id));
        setDragging({ id, parentId });
      },
      onDragOver: (event: DragEvent) => {
        if (!dragging || dragging.parentId !== parentId || dragging.id === id)
          return;
        event.preventDefault();
        const rect = (
          event.currentTarget as HTMLElement
        ).getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        setDropTarget((prev) =>
          prev?.id === id && prev.after === after ? prev : { id, after },
        );
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (!dragging || dragging.parentId !== parentId || !dropTarget) return;
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

  const hintFor = (id: number) =>
    dropTarget?.id === id ? (dropTarget.after ? "after" : "before") : null;

  return (
    <div className="space-y-0.5">
      {tree.length > 0 && (
        <div className="flex items-center gap-0.5 px-1 pb-1 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground"
            title={allCollapsed ? "展开全部一级分组" : "折叠全部一级分组"}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-3 w-3" />
            ) : (
              <ChevronsDownUp className="h-3 w-3" />
            )}
            {allCollapsed ? "全部展开" : "全部折叠"}
          </button>
          {onReorder && (
            <>
              <span className="ml-auto">排序</span>
              <button
                type="button"
                onClick={() => sortSiblings("count")}
                className="rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground"
                title="一级、二级分组都按 UP 数量从多到少排"
              >
                数量
              </button>
              <button
                type="button"
                onClick={() => sortSiblings("name")}
                className="rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground"
                title="一级、二级分组都按名称排"
              >
                名称
              </button>
            </>
          )}
        </div>
      )}

      <GroupRow
        name="未分组"
        count={uncategorizedCount}
        active={isActive("uncategorized", null)}
        depth={0}
        onClick={() => onSelect({ level: "uncategorized", id: null })}
      />

      {tree.map((l1) => (
        <div key={l1.id}>
          <GroupRow
            name={l1.name}
            count={l1.count}
            active={isActive("l1", l1.id)}
            depth={0}
            color={l1.color}
            expandable
            expanded={expandedL1.has(l1.id)}
            renaming={renamingId === l1.id}
            dropHint={hintFor(l1.id)}
            onToggle={() => toggleL1(l1.id)}
            onClick={() => {
              if (!expandedL1.has(l1.id)) toggleL1(l1.id);
              onSelect({ level: "l1", id: l1.id });
            }}
            {...(onRename
              ? {
                  onDoubleClick: () => setRenamingId(l1.id),
                  onRenameDone: (value: string | null) =>
                    finishRename(l1.id, l1.name, value),
                }
              : {})}
            {...dragProps(l1.id, null)}
          />

          {expandedL1.has(l1.id) &&
            l1.children.map((l2) => (
              <GroupRow
                key={l2.id}
                name={l2.name}
                count={l2.count}
                active={isActive("l2", l2.id)}
                depth={1}
                color={l2.color}
                renaming={renamingId === l2.id}
                dropHint={hintFor(l2.id)}
                onClick={() => onSelect({ level: "l2", id: l2.id })}
                {...(onRename
                  ? {
                      onDoubleClick: () => setRenamingId(l2.id),
                      onRenameDone: (value: string | null) =>
                        finishRename(l2.id, l2.name, value),
                    }
                  : {})}
                {...dragProps(l2.id, l1.id)}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
