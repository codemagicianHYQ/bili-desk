import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
export function ImageLightbox({ images, index, open, onClose, onIndexChange, }) {
    const [current, setCurrent] = useState(index);
    useEffect(() => {
        if (open)
            setCurrent(index);
    }, [open, index]);
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey)
                return;
            if (event.key === "ArrowLeft" && images.length > 1) {
                event.preventDefault();
                event.stopPropagation();
                const next = (current - 1 + images.length) % images.length;
                setCurrent(next);
                onIndexChange?.(next);
                return;
            }
            if (event.key === "ArrowRight" && images.length > 1) {
                event.preventDefault();
                event.stopPropagation();
                const next = (current + 1) % images.length;
                setCurrent(next);
                onIndexChange?.(next);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, current, images.length, onClose, onIndexChange]);
    if (!open || images.length === 0)
        return null;
    const src = images[current] ?? images[0];
    const go = (delta) => {
        if (images.length <= 1)
            return;
        const next = (current + delta + images.length) % images.length;
        setCurrent(next);
        onIndexChange?.(next);
    };
    return (_jsx(OverlayPortal, { children: _jsxs("div", { className: cn("fixed inset-0 flex items-center justify-center bg-black/85 p-4", APP_OVERLAY_ZCLASS), onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": "\u56FE\u7247\u9884\u89C8", children: [_jsx("button", { type: "button", className: "absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20", onClick: onClose, "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-5 w-5" }) }), images.length > 1 && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20", onClick: (event) => {
                                event.stopPropagation();
                                go(-1);
                            }, "aria-label": "\u4E0A\u4E00\u5F20", children: _jsx(ChevronLeft, { className: "h-6 w-6" }) }), _jsx("button", { type: "button", className: "absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20", onClick: (event) => {
                                event.stopPropagation();
                                go(1);
                            }, "aria-label": "\u4E0B\u4E00\u5F20", children: _jsx(ChevronRight, { className: "h-6 w-6" }) }), _jsxs("p", { className: "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white", children: [current + 1, " / ", images.length] })] })), _jsx("div", { className: "max-h-[90vh] max-w-[92vw]", children: _jsx(BiliImage, { src: src, alt: "\u8BC4\u8BBA\u56FE\u7247\u9884\u89C8", loading: "eager", className: "max-h-[90vh] max-w-[92vw] object-contain" }) })] }) }));
}
