import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./components/layout/AppErrorBoundary";
import { useAppStore } from "./stores/app-store";
import "./styles/index.css";

function Bootstrap() {
  const { loadTheme, loadUser } = useAppStore();

  React.useEffect(() => {
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
