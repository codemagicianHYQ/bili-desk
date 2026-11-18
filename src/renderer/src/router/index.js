import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, createHashRouter } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { LoginPage } from "@/features/login/LoginPage";
import { UpSpacePage } from "@/features/up/UpSpacePage";
import { DynamicDetailPage } from "@/features/dynamics/DynamicDetailPage";
import { ArticleDetailPage } from "@/features/article/ArticleDetailPage";
import { TopicPage } from "@/features/topic/TopicPage";
import { SeasonPage } from "@/features/season/SeasonPage";
import { ChannelPage } from "@/features/channel/ChannelPage";
import { AudioPage } from "@/features/audio/AudioPage";
export const router = createHashRouter([
    {
        path: "/",
        element: _jsx(MainLayout, {}),
        children: [
            { index: true, element: null },
            { path: "popular", element: null },
            { path: "favorites", element: null },
            { path: "collections", element: null },
            { path: "following", element: null },
            { path: "dynamics", element: null },
            { path: "dynamic/:id", element: _jsx(DynamicDetailPage, {}) },
            { path: "topic/:id", element: _jsx(TopicPage, {}) },
            { path: "season/:kind/:id", element: _jsx(SeasonPage, {}) },
            { path: "channel/:id", element: _jsx(ChannelPage, {}) },
            { path: "audio/:id", element: _jsx(AudioPage, {}) },
            { path: "article/:id", element: _jsx(ArticleDetailPage, {}) },
            { path: "history", element: null },
            { path: "watch-later", element: null },
            { path: "me", element: null },
            { path: "video/:bvid", element: null },
            { path: "live/:roomId", element: null },
            { path: "up/:mid", element: _jsx(UpSpacePage, {}) },
            { path: "search", element: _jsx(Navigate, { to: "/", replace: true }) },
            { path: "integrity", element: null },
            { path: "up-activity", element: null },
            { path: "settings", element: null },
            { path: "messages", element: null },
        ],
    },
    { path: "/login", element: _jsx(LoginPage, {}) },
]);
