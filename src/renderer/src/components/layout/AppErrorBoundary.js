import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
export class AppErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error("[BiliDesk] renderer crash", error, info.componentStack);
    }
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsxs("div", { className: "flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center", children: [_jsx("p", { className: "text-base font-medium", children: "\u9875\u9762\u51FA\u4E86\u70B9\u95EE\u9898" }), _jsx("p", { className: "max-w-md text-sm text-muted-foreground", children: this.state.error.message || "渲染进程异常" }), _jsx("button", { type: "button", className: "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground", onClick: () => window.location.reload(), children: "\u5237\u65B0\u9875\u9762" })] }));
    }
}
