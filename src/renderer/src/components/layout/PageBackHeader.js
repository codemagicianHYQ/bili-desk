import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function PageBackHeader({ fallback = "/", label = "返回", className, trailing, }) {
    const navigate = useNavigate();
    return (_jsxs("div", { "data-page-chrome": true, className: cn("sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/40 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/30", className), children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "gap-2 rounded-full border border-transparent bg-secondary/40 px-4 shadow-sm transition-colors hover:border-border hover:bg-secondary/70", onClick: () => {
                    if (window.history.length > 1) {
                        navigate(-1);
                    }
                    else {
                        navigate(fallback);
                    }
                }, children: [_jsx(ArrowLeft, { className: "h-4 w-4" }), label] }), trailing] }));
}
