import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export interface SpaceTab<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

export function SpaceTabBar<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<SpaceTab<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scrollbar-overlay flex items-end gap-8 overflow-x-auto border-b border-border",
        className,
      )}
    >
      {tabs.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "relative shrink-0 px-1 pb-3 pt-2.5 text-sm transition-colors",
              active
                ? "font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {item.label}
            </span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
