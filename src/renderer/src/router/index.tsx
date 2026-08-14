import { Navigate, createHashRouter } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { LoginPage } from "@/features/login/LoginPage";
import { UpSpacePage } from "@/features/up/UpSpacePage";
import { DynamicDetailPage } from "@/features/dynamics/DynamicDetailPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: null },
      { path: "popular", element: null },
      { path: "favorites", element: null },
      { path: "following", element: null },
      { path: "dynamics", element: null },
      { path: "dynamic/:id", element: <DynamicDetailPage /> },
      { path: "history", element: null },
      { path: "watch-later", element: null },
      { path: "me", element: null },
      { path: "video/:bvid", element: null },
      { path: "live/:roomId", element: null },
      { path: "up/:mid", element: <UpSpacePage /> },
      { path: "search", element: <Navigate to="/" replace /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "/login", element: <LoginPage /> },
]);
