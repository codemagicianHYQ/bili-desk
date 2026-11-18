import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./components/layout/AppErrorBoundary";
import { initSessionCaches } from "./lib/session-cache-lifecycle";
import { useAppStore } from "./stores/app-store";
import "./styles/index.css";
function Bootstrap() {
    const { loadTheme, loadUser } = useAppStore();
    React.useEffect(() => {
        initSessionCaches();
        useAppStore.getState().loadPreferences();
        void loadTheme();
        void loadUser();
    }, [loadTheme, loadUser]);
    return _jsx(App, {});
}
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(AppErrorBoundary, { children: _jsx(Bootstrap, {}) }) }));
