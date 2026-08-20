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
    void loadTheme();
    void loadUser();
  }, [loadTheme, loadUser]);

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Bootstrap />
    </AppErrorBoundary>
  </React.StrictMode>,
);
