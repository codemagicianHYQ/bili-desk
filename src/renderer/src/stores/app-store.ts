import { create } from 'zustand'
import type { Theme, UserInfo } from '@shared/types'

export type HomeGridColumns = 2 | 3 | 4 | 5

const HOME_GRID_STORAGE_KEY = 'bilidesk-home-grid-columns'

function readHomeGridColumns(): HomeGridColumns {
  const raw = localStorage.getItem(HOME_GRID_STORAGE_KEY)
  if (raw === '2' || raw === '3' || raw === '4' || raw === '5') {
    return Number(raw) as HomeGridColumns
  }
  return 3
}

interface AppState {
  theme: Theme
  user: UserInfo | null
  homeGridColumns: HomeGridColumns
  setTheme: (theme: Theme) => Promise<void>
  loadTheme: () => Promise<void>
  loadUser: () => Promise<void>
  loadPreferences: () => void
  setHomeGridColumns: (columns: HomeGridColumns) => void
  setUser: (user: UserInfo | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  user: null,
  homeGridColumns: readHomeGridColumns(),
  setTheme: async (theme) => {
    await window.biliDesk.app.setTheme(theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
  loadTheme: async () => {
    const theme = await window.biliDesk.app.getTheme()
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
  loadUser: async () => {
    const user = await window.biliDesk.auth.getStatus()
    set({ user })
  },
  loadPreferences: () => {
    set({ homeGridColumns: readHomeGridColumns() })
  },
  setHomeGridColumns: (columns) => {
    localStorage.setItem(HOME_GRID_STORAGE_KEY, String(columns))
    set({ homeGridColumns: columns })
  },
  setUser: (user) => set({ user })
}))
