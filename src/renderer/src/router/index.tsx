import { Navigate, createHashRouter } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { LoginPage } from "@/features/login/LoginPage";
import { UpSpacePage } from "@/features/up/UpSpacePage";
import { DynamicDetailPage } from "@/features/dynamics/DynamicDetailPage";
import { ArticleDetailPage } from "@/features/article/ArticleDetailPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { IntegrityPage } from "@/features/integrity/IntegrityPage";
import { UpActivityPage } from "@/features/up-activity/UpActivityPage";

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
      { path: "article/:id", element: <ArticleDetailPage /> },
      { path: "history", element: null },
      { path: "watch-later", element: null },
      { path: "me", element: null },
      { path: "video/:bvid", element: null },
      { path: "live/:roomId", element: null },
      { path: "up/:mid", element: <UpSpacePage /> },
      { path: "search", element: <Navigate to="/" replace /> },
      { path: "integrity", element: <IntegrityPage /> },
      { path: "up-activity", element: <UpActivityPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "/login", element: <LoginPage /> },
]);
