import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { CategoryTreeNode, LocalCategoryLevel, LocalCategorySelection } from '@shared/types'
import { cn } from '@/lib/utils'

interface CategoryTreeProps {
  tree: CategoryTreeNode[]
  selection: LocalCategorySelection
  onSelect: (selection: LocalCategorySelection) => void
  onRename?: (level: 'l1' | 'l2' | 'l3', id: number, currentName: string) => void
}

function CategoryRow({
  name,
  count,
  active,
  depth,
  expandable,
  expanded,
  onToggle,
  onClick,
  onRename
}: {
  name: string
  count?: number
  active: boolean
  depth: number
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  onClick: () => void
  onRename?: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {expandable ? (
        <button type="button" onClick={onToggle} className="shrink-0 rounded p-0.5 hover:bg-secondary">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        {depth === 0 && (active ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />)}
        <span className="truncate">{name}</span>
        {count != null && count > 0 && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{count}</span>
        )}
      </button>
      {onRename && (
        <button
          type="button"
          title="编辑名称"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
          className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function CategoryTree({ tree, selection, onSelect, onRename }: CategoryTreeProps) {
  const [expandedL1, setExpandedL1] = useState<Set<number>>(new Set(tree.map((n) => n.id)))
  const [expandedL2, setExpandedL2] = useState<Set<number>>(new Set())

  const toggleL1 = (id: number) => {
    setExpandedL1((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleL2 = (id: number) => {
    setExpandedL2((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (level: LocalCategoryLevel, id: number | null) =>
    selection.level === level && selection.id === id

  return (
    <div className="space-y-0.5 text-sm">
      <CategoryRow
        name="全部收藏"
        active={isActive('all', null)}
        depth={0}
        onClick={() => onSelect({ level: 'all', id: null })}
      />

      {tree.map((l1) => (
        <div key={l1.id}>
          <CategoryRow
            name={l1.name}
            count={l1.count}
            active={isActive('l1', l1.id)}
            depth={0}
            expandable
            expanded={expandedL1.has(l1.id)}
            onToggle={() => toggleL1(l1.id)}
            onClick={() => {
              if (!expandedL1.has(l1.id)) toggleL1(l1.id)
              onSelect({ level: 'l1', id: l1.id })
            }}
            onRename={onRename ? () => onRename('l1', l1.id, l1.name) : undefined}
          />

          {expandedL1.has(l1.id) &&
            l1.children.map((l2) => (
              <div key={l2.id}>
                <CategoryRow
                  name={l2.name}
                  count={l2.count}
                  active={isActive('l2', l2.id)}
                  depth={1}
                  expandable={l2.children.length > 0}
                  expanded={expandedL2.has(l2.id)}
                  onToggle={() => toggleL2(l2.id)}
                  onClick={() => {
                    if (l2.children.length > 0 && !expandedL2.has(l2.id)) toggleL2(l2.id)
                    onSelect({ level: 'l2', id: l2.id })
                  }}
                  onRename={onRename ? () => onRename('l2', l2.id, l2.name) : undefined}
                />

                {expandedL2.has(l2.id) &&
                  l2.children.map((l3) => (
                    <CategoryRow
                      key={l3.id}
                      name={l3.name}
                      count={l3.count}
                      active={isActive('l3', l3.id)}
                      depth={2}
                      onClick={() => onSelect({ level: 'l3', id: l3.id })}
                      onRename={onRename ? () => onRename('l3', l3.id, l3.name) : undefined}
                    />
                  ))}
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
