import { create } from 'zustand'
import type { Theme, UserInfo } from '@shared/types'

interface AppState {
  theme: Theme
  user: UserInfo | null
  setTheme: (theme: Theme) => Promise<void>
  loadTheme: () => Promise<void>
  loadUser: () => Promise<void>
  setUser: (user: UserInfo | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  user: null,
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
  setUser: (user) => set({ user })
}))
