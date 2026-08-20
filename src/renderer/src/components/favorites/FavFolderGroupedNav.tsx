import { useEffect, useRef, useState, type DragEvent } from "react";
import type { FavFolder } from "@shared/types";
import {
  groupFavFolders,
  UNGROUPED_L1,
  type FavFolderGroupOverrides,
  type FolderNavBlock,
  type FolderNavItem,
  type FolderNavL2,
} from "@shared/utils/fav-folder-groups";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eraser,
  Folder,
  GripVertical,
  MoreHorizontal,
  Pencil,
} from "lucide-react";

interface FavFolderGroupedNavProps {
  folders: FavFolder[];
  groupOverrides?: FavFolderGroupOverrides;
  selectedFolder: number | null;
  draggingFolderId: number | null;
  dropFolderId: number | null;
  dropGroupName: string | null;
  onSelect: (folderId: number) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, folder: FavFolder) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, folderId: number) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, folderId: number) => void;
  onDragOverGroup: (event: DragEvent<HTMLElement>, groupName: string) => void;
  onDropOnGroup: (event: DragEvent<HTMLElement>, groupName: string) => void;
  onDragEnd: () => void;
  shouldIgnoreClick: () => boolean;
  onEdit: (folder: FavFolder) => void;
  onCleanInvalid: (folder: FavFolder) => void;
}

function l1CollapseKeys(blocks: FolderNavBlock[]): string[] {
  const keys: string[] = [];
  for (const block of blocks) {
    if (block.kind === "l1") keys.push(`l1:${block.name}`);
    if (block.kind === "ungrouped") keys.push(`l1:${UNGROUPED_L1}`);
  }
  return keys;
}

function isL2Item(item: FolderNavItem | FolderNavL2): item is FolderNavL2 {
  return "kind" in item && item.kind === "l2";
}

function SectionRule({
  title,
  count,
  collapsed,
  onToggle,
  nested = false,
  dropActive = false,
  onDragOver,
  onDrop,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  nested?: boolean;
  dropActive?: boolean;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 text-left",
        nested ? "pl-3 pr-1" : "px-1",
        dropActive && "bg-primary/10 ring-1 ring-primary/70",
      )}
    >
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
          collapsed && "-rotate-90",
        )}
      />
      <span
        className={cn(
          "shrink-0 font-medium text-muted-foreground",
          nested ? "text-[10px]" : "text-[11px]",
        )}
      >
        {title}
      </span>
      <span className="h-px min-w-2 flex-1 bg-border" />
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

export function FavFolderGroupedNav({
  folders,
  groupOverrides = {},
  selectedFolder,
  draggingFolderId,
  dropFolderId,
  dropGroupName,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragOverGroup,
  onDropOnGroup,
  onDragEnd,
  shouldIgnoreClick,
  onEdit,
  onCleanInvalid,
}: FavFolderGroupedNavProps) {
  const { pinned, blocks } = groupFavFolders(folders, groupOverrides);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menuFolderId, setMenuFolderId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuFolderId == null) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuFolderId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFolderId]);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const l1Keys = l1CollapseKeys(blocks);
  const allL1Collapsed =
    l1Keys.length > 0 && l1Keys.every((key) => collapsed.has(key));

  const toggleAllL1 = () => {
    setCollapsed((prev) => {
      if (allL1Collapsed) {
        const next = new Set(prev);
        for (const key of l1Keys) next.delete(key);
        return next;
      }
      return new Set([...prev, ...l1Keys]);
    });
  };

  const renderFolderRow = (
    item: FolderNavItem,
    options: { canDrag: boolean; nested?: boolean },
  ) => {
    const folder = item.folder;
    const canDrag = options.canDrag && !folder.isDefault;
    const dragging = draggingFolderId === folder.id;
    const dropTarget =
      dropFolderId === folder.id &&
      draggingFolderId != null &&
      draggingFolderId !== folder.id;

    return (
      <div
        key={folder.id}
        draggable={canDrag}
        onDragStart={(event) => onDragStart(event, folder)}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver(event, folder.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!canDrag) return;
          onDrop(event, folder.id);
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group flex items-center gap-0.5 rounded-lg",
          options.nested && "ml-2",
          dragging && "bg-primary/20 text-primary opacity-90",
          dropTarget && "ring-1 ring-primary/70 bg-primary/10",
          !dragging &&
            !dropTarget &&
            selectedFolder === folder.id &&
            "bg-primary/10 text-primary",
          !dragging &&
            !dropTarget &&
            selectedFolder !== folder.id &&
            "text-foreground hover:bg-secondary",
        )}
      >
        {canDrag ? (
          <span
            className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
            title="拖动排序"
            aria-hidden
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => {
            if (shouldIgnoreClick()) return;
            onSelect(folder.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm"
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={folder.title}>
            {item.label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {folder.mediaCount}
          </span>
        </button>
        <div
          className="relative shrink-0"
          ref={menuFolderId === folder.id ? menuRef : undefined}
        >
          <button
            type="button"
            draggable={false}
            title="收藏夹操作"
            aria-label="收藏夹操作"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuFolderId((current) =>
                current === folder.id ? null : folder.id,
              );
            }}
            className={cn(
              "mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground",
              selectedFolder === folder.id || menuFolderId === folder.id
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuFolderId === folder.id && (
            <div className="absolute right-1 top-8 z-20 min-w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuFolderId(null);
                  onEdit(folder);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑信息
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuFolderId(null);
                  onCleanInvalid(folder);
                }}
              >
                <Eraser className="h-3.5 w-3.5" />
                清除已失效
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBlock = (block: FolderNavBlock) => {
    if (block.kind === "flat") {
      return renderFolderRow(
        { folder: block.folder, label: block.label },
        { canDrag: true },
      );
    }

    if (block.kind === "overflow") {
      return (
        <div key={block.folders[0]?.folder.id} className="space-y-0.5">
          {block.folders.map((item, index) =>
            renderFolderRow(item, { canDrag: true, nested: index > 0 }),
          )}
        </div>
      );
    }

    if (block.kind === "ungrouped") {
      const count = block.folders.reduce(
        (sum, item) => sum + item.folder.mediaCount,
        0,
      );
      const l1Collapsed = collapsed.has(`l1:${UNGROUPED_L1}`);
      return (
        <div key="ungrouped" className="pt-1">
          <SectionRule
            title={UNGROUPED_L1}
            count={count}
            collapsed={l1Collapsed}
            onToggle={() => {
              if (shouldIgnoreClick()) return;
              toggle(`l1:${UNGROUPED_L1}`);
            }}
            dropActive={dropGroupName === UNGROUPED_L1}
            onDragOver={(event) => {
              event.preventDefault();
              onDragOverGroup(event, UNGROUPED_L1);
            }}
            onDrop={(event) => {
              event.preventDefault();
              onDropOnGroup(event, UNGROUPED_L1);
            }}
          />
          {!l1Collapsed && (
            <div className="space-y-0.5">
              {block.folders.map((item) =>
                renderFolderRow(item, { canDrag: true, nested: true }),
              )}
            </div>
          )}
        </div>
      );
    }

    const l1Key = `l1:${block.name}`;
    const l1Collapsed = collapsed.has(l1Key);
    return (
      <div key={l1Key} className="pt-1">
        <SectionRule
          title={block.name}
          count={block.totalCount}
          collapsed={l1Collapsed}
          onToggle={() => toggle(l1Key)}
          dropActive={dropGroupName === block.name}
          onDragOver={(event) => {
            event.preventDefault();
            onDragOverGroup(event, block.name);
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropOnGroup(event, block.name);
          }}
        />
        {!l1Collapsed && (
          <div className="space-y-0.5">
            {block.items.map((item) => {
              if (!isL2Item(item)) {
                return renderFolderRow(item, { canDrag: true, nested: true });
              }
              const l2Key = `l2:${block.name}/${item.name}`;
              const l2Collapsed = collapsed.has(l2Key);
              const l2Count = item.folders.reduce(
                (sum, entry) => sum + entry.folder.mediaCount,
                0,
              );
              return (
                <div key={l2Key}>
                  <SectionRule
                    title={item.name}
                    count={l2Count}
                    collapsed={l2Collapsed}
                    onToggle={() => toggle(l2Key)}
                    nested
                  />
                  {!l2Collapsed &&
                    item.folders.map((entry) =>
                      renderFolderRow(entry, { canDrag: true, nested: true }),
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {pinned.map((folder) =>
        renderFolderRow({ folder, label: folder.title }, { canDrag: false }),
      )}
      {l1Keys.length > 0 && (
        <button
          type="button"
          onClick={toggleAllL1}
          className="flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={allL1Collapsed ? "展开全部一级分类" : "折叠全部一级分类"}
        >
          {allL1Collapsed ? (
            <ChevronsUpDown className="h-3 w-3" />
          ) : (
            <ChevronsDownUp className="h-3 w-3" />
          )}
          {allL1Collapsed ? "全部展开" : "全部折叠"}
        </button>
      )}
      {blocks.map((block) => renderBlock(block))}
    </div>
  );
}
