import { createHashRouter } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { FavoritesPage } from '@/features/favorites/FavoritesPage'
import { FollowingPage } from '@/features/following/FollowingPage'
import { VideoPage } from '@/features/video/VideoPage'
import { SearchPage } from '@/features/search/SearchPage'
import { LoginPage } from '@/features/login/LoginPage'
import { UpSpacePage } from '@/features/up/UpSpacePage'
import { SettingsPage } from '@/features/settings/SettingsPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: null },
      { path: 'favorites', element: <FavoritesPage /> },
      { path: 'following', element: <FollowingPage /> },
      { path: 'video/:bvid', element: <VideoPage /> },
      { path: 'up/:mid', element: <UpSpacePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  },
  { path: '/login', element: <LoginPage /> }
])
