import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PageBackHeaderProps {
  fallback?: string
  label?: string
  className?: string
}

export function PageBackHeader({ fallback = '/', label = '返回', className }: PageBackHeaderProps) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'sticky top-0 z-30 shrink-0 border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/70',
        className
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 rounded-full border border-transparent bg-secondary/40 px-4 shadow-sm transition-colors hover:border-border hover:bg-secondary/70"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1)
          } else {
            navigate(fallback)
          }
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    </div>
  )
}
