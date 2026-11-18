import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";
export function App() {
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(WindowTitleBar, {}), _jsx("div", { className: "min-h-0 flex-1", children: _jsx(RouterProvider, { router: router }) })] }));
}
