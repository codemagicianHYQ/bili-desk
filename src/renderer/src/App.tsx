import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";

export function App() {
  return (
    <div className="flex h-full flex-col">
      <WindowTitleBar />
      <div className="min-h-0 flex-1">
        <RouterProvider router={router} />
      </div>
    </div>
  );
}
