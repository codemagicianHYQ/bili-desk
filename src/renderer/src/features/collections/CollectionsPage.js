import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { MyCollectionsPanel } from "@/features/me/MyCollectionsPanel";
export function CollectionsPage() {
    const user = useAppStore((s) => s.user);
    const mid = user?.mid ?? 0;
    const loggedIn = Boolean(user?.isLogin && mid > 0);
    if (!loggedIn) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-4 px-6 text-center", children: [_jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/40", children: _jsx(Layers, { className: "h-7 w-7 text-primary" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u5408\u96C6" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u67E5\u770B\u5DF2\u8BA2\u9605\u4E0E\u81EA\u5EFA\u5408\u96C6" })] }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/login", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col overflow-hidden", children: [_jsx("div", { className: "shrink-0 border-b border-border/60 px-5 py-4", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary", children: _jsx(Layers, { className: "h-5 w-5" }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-base font-semibold tracking-tight", children: "\u5408\u96C6" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u8BA2\u9605\u7684\u89C6\u9891\u5408\u96C6\u4E0E\u81EA\u5DF1\u521B\u5EFA\u7684\u5408\u96C6 / \u7CFB\u5217" })] })] }) }), _jsx("div", { className: "min-h-0 flex-1 overflow-hidden p-4 lg:p-5", children: _jsx(MyCollectionsPanel, { mid: mid, layout: "page" }) })] }));
}
