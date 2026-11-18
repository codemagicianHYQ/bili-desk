import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_OVERLAY_ZCLASS, OverlayPortal } from '@/components/ui/overlay-portal';
import { cn } from '@/lib/utils';
export function ConfirmDialog({ open, title, description, confirmLabel = '确定', cancelLabel = '取消', destructive = false, loading = false, onConfirm, onCancel, children }) {
    useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !loading)
                onCancel();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, loading, onCancel]);
    if (!open)
        return null;
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn('fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center', APP_OVERLAY_ZCLASS), "data-glass-scrim": true, onClick: () => {
                if (!loading)
                    onCancel();
            }, children: _jsxs("div", { role: "alertdialog", "aria-modal": "true", "aria-labelledby": "confirm-dialog-title", "aria-describedby": description ? 'confirm-dialog-description' : undefined, "data-glass-panel": true, className: "bili-glass w-full max-w-sm rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 px-5 pt-5", children: [_jsx("div", { className: "min-w-0 flex-1", children: children }), _jsx("button", { type: "button", disabled: loading, onClick: onCancel, className: "shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50", "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "space-y-1 px-5 pb-1 pt-3", children: [_jsx("h2", { id: "confirm-dialog-title", className: "text-base font-semibold", children: title }), description && (_jsx("p", { id: "confirm-dialog-description", className: "text-sm leading-relaxed text-muted-foreground", children: description }))] }), _jsxs("div", { className: "flex gap-2 p-4 pt-3", children: [_jsx(Button, { type: "button", variant: "secondary", className: "flex-1", disabled: loading, onClick: onCancel, children: cancelLabel }), _jsx(Button, { type: "button", className: cn('flex-1', destructive && 'border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25'), disabled: loading, onClick: onConfirm, children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u5904\u7406\u4E2D..."] })) : (confirmLabel) })] })] }) }) }));
}
