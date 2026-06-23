import type { UpGroup } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UpGroupPanelProps {
  groups: UpGroup[]
  selectedId?: number | null
  onSelect?: (id: number) => void
}

export function UpGroupPanel({ groups, selectedId, onSelect }: UpGroupPanelProps) {
  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onSelect?.(group.id)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
            selectedId === group.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
          )}
        >
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
            {group.name}
          </span>
          <span className="flex items-center gap-2">
            {group.isAiGenerated && <Badge variant="ai">AI</Badge>}
            <span className="text-xs text-muted-foreground">{group.memberCount}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
