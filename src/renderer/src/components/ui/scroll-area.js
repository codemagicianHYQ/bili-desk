import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";
import { cn } from "@/lib/utils";
export const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (_jsxs(ScrollAreaPrimitive.Root, { ref: ref, className: cn("relative overflow-hidden", className), ...props, children: [_jsx(ScrollAreaPrimitive.Viewport, { className: "h-full w-full rounded-[inherit]", children: children }), _jsx(ScrollAreaPrimitive.Scrollbar, { orientation: "vertical", className: "flex w-2 touch-none select-none p-0.5 transition-colors", children: _jsx(ScrollAreaPrimitive.Thumb, { className: "relative flex-1 rounded-full bg-muted-foreground/25 transition-colors hover:bg-muted-foreground/40" }) })] })));
ScrollArea.displayName = "ScrollArea";
