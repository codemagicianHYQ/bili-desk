import * as React from 'react'
import { cn } from '@/lib/utils'

export const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'ai' }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      variant === 'default' && 'bg-primary/15 text-primary',
      variant === 'secondary' && 'bg-secondary text-secondary-foreground',
      variant === 'ai' && 'bg-blue-500/15 text-blue-400',
      className
    )}
    {...props}
  />
))
Badge.displayName = 'Badge'
