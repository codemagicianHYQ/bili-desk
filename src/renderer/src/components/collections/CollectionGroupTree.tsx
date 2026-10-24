import { useState } from "react";
import type { CollectionGroupMap, UserCollectionItem } from "@shared/types";
import {
  UNGROUPED_COLLECTION_L1,
  collectionGroupKey,
} from "@shared/utils/collection-groups";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Folder, Inbox, Layers } from "lucide-react";

export interface CollectionGroupSelection {
  /** null = 全部；UNGROUPED_COLLECTION_L1 = 未分组 */
  l1: string | null;
  l2: string | null;
}

export interface CollectionTreeL1 {
  name: string;
  count: number;
  children: Array<{ name: string; count: number }>;
}

export function buildCollectionTree(
  items: UserCollectionItem[],
  groups: CollectionGroupMap,
): { tree: CollectionTreeL1[]; ungrouped: number } {
  const l1Map = new Map<string, Map<string, number>>();
  let ungrouped = 0;
  for (const item of items) {
    const group = groups[collectionGroupKey(item)];
    if (!group) {
      ungrouped++;
      continue;
    }
    const l2Map = l1Map.get(group.l1) ?? new Map<string, number>();
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
export function buildTreeFromGroups(
  groups: CollectionGroupMap,
): CollectionTreeL1[] {
  const fake = Object.keys(groups).map((key) => {
    const [kind, id] = key.split(":");
    return { kind, id: Number(id) } as UserCollectionItem;
  });
  return buildCollectionTree(fake, groups).tree;
}

export function matchesCollectionSelection(
  item: UserCollectionItem,
  groups: CollectionGroupMap,
  selection: CollectionGroupSelection,
): boolean {
  if (selection.l1 == null) return true;
  const group = groups[collectionGroupKey(item)];
  if (selection.l1 === UNGROUPED_COLLECTION_L1) return !group;
  if (!group || group.l1 !== selection.l1) return false;
  return selection.l2 == null || group.l2 === selection.l2;
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => onDone(value.trim() || null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(value.trim() || null);
        if (event.key === "Escape") onDone(null);
      }}
      className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1 text-sm outline-none"
    />
  );
}

export function CollectionGroupTree({
  tree,
  total,
  ungrouped,
  selection,
  onSelect,
  onRename,
}: {
  tree: CollectionTreeL1[];
  total: number;
  ungrouped: number;
  selection: CollectionGroupSelection;
  onSelect: (selection: CollectionGroupSelection) => void;
  onRename: (l1: string, l2: string | null, name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  const rowClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
      active ? "bg-primary/10 text-primary" : "hover:bg-secondary",
    );

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className={rowClass(selection.l1 == null)}
        onClick={() => onSelect({ l1: null, l2: null })}
      >
        <Layers className="h-4 w-4 shrink-0" />
        <span className="flex-1">全部合集</span>
        <span className="text-xs text-muted-foreground">{total}</span>
      </button>

      {tree.map((l1) => {
        const open = !collapsed.has(l1.name);
        const l1Key = `l1:${l1.name}`;
        return (
          <div key={l1.name}>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                rowClass(selection.l1 === l1.name && selection.l2 == null),
                "font-medium",
              )}
              onClick={() => onSelect({ l1: l1.name, l2: null })}
              onDoubleClick={() => setRenaming(l1Key)}
              title="双击重命名"
            >
              <span
                className="-ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(l1.name);
                }}
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </span>
              {renaming === l1Key ? (
                <RenameInput
                  initial={l1.name}
                  onDone={(value) => {
                    setRenaming(null);
                    if (value && value !== l1.name)
                      onRename(l1.name, null, value);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{l1.name}</span>
              )}
              <span className="text-xs font-normal text-muted-foreground">
                {l1.count}
              </span>
            </div>
            {open && (
              <div className="ml-3 space-y-0.5 border-l border-border/60 pl-2">
                {l1.children.map((l2) => {
                  const l2Key = `l2:${l1.name}/${l2.name}`;
                  return (
                    <div
                      key={l2.name}
                      role="button"
                      tabIndex={0}
                      className={rowClass(
                        selection.l1 === l1.name && selection.l2 === l2.name,
                      )}
                      onClick={() => onSelect({ l1: l1.name, l2: l2.name })}
                      onDoubleClick={() => setRenaming(l2Key)}
                      title="双击重命名"
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      {renaming === l2Key ? (
                        <RenameInput
                          initial={l2.name}
                          onDone={(value) => {
                            setRenaming(null);
                            if (value && value !== l2.name)
                              onRename(l1.name, l2.name, value);
                          }}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate">
                          {l2.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {l2.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {ungrouped > 0 && (
        <button
          type="button"
          className={rowClass(selection.l1 === UNGROUPED_COLLECTION_L1)}
          onClick={() => onSelect({ l1: UNGROUPED_COLLECTION_L1, l2: null })}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          <span className="flex-1">{UNGROUPED_COLLECTION_L1}</span>
          <span className="text-xs text-muted-foreground">{ungrouped}</span>
        </button>
      )}
    </div>
  );
}
