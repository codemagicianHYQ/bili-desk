import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { UpGroupSelection, UpGroupSelectionLevel, UpGroupTreeNode } from '@shared/types'
import { cn } from '@/lib/utils'

interface UpGroupTreeProps {
  tree: UpGroupTreeNode[]
  selection: UpGroupSelection
  uncategorizedCount?: number
  onSelect: (selection: UpGroupSelection) => void
}

function GroupRow({
  name,
  count,
  active,
  depth,
  color,
  expandable,
  expanded,
  onToggle,
  onClick
}: {
  name: string
  count?: number
  active: boolean
  depth: number
  color?: string
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg pr-1 transition-colors',
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
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm">
        {depth === 0 ? (
          active ? (
            <FolderOpen className="h-4 w-4 shrink-0" style={{ color }} />
          ) : (
            <Folder className="h-4 w-4 shrink-0" style={{ color }} />
          )
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? '#94a3b8' }} />
        )}
        <span className="truncate">{name}</span>
        {count != null && count > 0 && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{count}</span>
        )}
      </button>
    </div>
  )
}

export function UpGroupTree({ tree, selection, uncategorizedCount, onSelect }: UpGroupTreeProps) {
  const [expandedL1, setExpandedL1] = useState<Set<number>>(new Set(tree.map((node) => node.id)))

  const toggleL1 = (id: number) => {
    setExpandedL1((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (level: UpGroupSelectionLevel, id: number | null) =>
    selection.level === level && selection.id === id

  return (
    <div className="space-y-0.5">
      <GroupRow
        name="未分组"
        count={uncategorizedCount}
        active={isActive('uncategorized', null)}
        depth={0}
        onClick={() => onSelect({ level: 'uncategorized', id: null })}
      />

      {tree.map((l1) => (
        <div key={l1.id}>
          <GroupRow
            name={l1.name}
            count={l1.count}
            active={isActive('l1', l1.id)}
            depth={0}
            color={l1.color}
            expandable
            expanded={expandedL1.has(l1.id)}
            onToggle={() => toggleL1(l1.id)}
            onClick={() => {
              if (!expandedL1.has(l1.id)) toggleL1(l1.id)
              onSelect({ level: 'l1', id: l1.id })
            }}
          />

          {expandedL1.has(l1.id) &&
            l1.children.map((l2) => (
              <GroupRow
                key={l2.id}
                name={l2.name}
                count={l2.count}
                active={isActive('l2', l2.id)}
                depth={1}
                color={l2.color}
                onClick={() => onSelect({ level: 'l2', id: l2.id })}
              />
            ))}
        </div>
      ))}
    </div>
  )
}
