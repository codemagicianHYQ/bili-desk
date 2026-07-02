import { useEffect, useRef, useState } from 'react'
import { Check, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore, type HomeGridColumns } from '@/stores/app-store'

const COLUMN_OPTIONS: Array<{ value: HomeGridColumns; label: string }> = [
  { value: 2, label: '2 列' },
  { value: 3, label: '3 列' },
  { value: 4, label: '4 列' },
  { value: 5, label: '5 列' }
]

export function HomeGridLayoutPicker() {
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const homeGridColumns = useAppStore((state) => state.homeGridColumns)
  const setHomeGridColumns = useAppStore((state) => state.setHomeGridColumns)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="布局设置"
        title={`当前 ${homeGridColumns} 列布局`}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          <p className="px-3 py-1.5 text-xs text-muted-foreground">每行显示</p>
          {COLUMN_OPTIONS.map((option) => {
            const active = homeGridColumns === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-secondary',
                  active && 'text-primary'
                )}
                onClick={() => {
                  setHomeGridColumns(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {active && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
