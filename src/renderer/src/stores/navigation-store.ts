import { create } from 'zustand'

interface NavigationState {
  followingKeepAlive: boolean
  favoritesKeepAlive: boolean
  syncKeepAlive: (path: string, prevPath: string) => void
}

const MAIN_SECTIONS = new Set(['/', '/favorites', '/following', '/search', '/settings'])

function isUpPath(path: string): boolean {
  return path.startsWith('/up/')
}

function isVideoPath(path: string): boolean {
  return path.startsWith('/video/')
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  followingKeepAlive: false,
  favoritesKeepAlive: false,

  syncKeepAlive: (path, prevPath) => {
    let followingKeepAlive = get().followingKeepAlive
    let favoritesKeepAlive = get().favoritesKeepAlive

    if (path === '/following' || isUpPath(path)) {
      followingKeepAlive = true
    } else if (isVideoPath(path) && (prevPath === '/following' || isUpPath(prevPath))) {
      followingKeepAlive = true
    } else if (MAIN_SECTIONS.has(path) && path !== '/following') {
      followingKeepAlive = false
    }

    if (path === '/favorites') {
      favoritesKeepAlive = true
    } else if (isVideoPath(path) && (prevPath === '/favorites' || isVideoPath(prevPath) || isUpPath(prevPath))) {
      if (prevPath === '/favorites' || favoritesKeepAlive) {
        favoritesKeepAlive = true
      }
    } else if (isUpPath(path) && favoritesKeepAlive) {
      favoritesKeepAlive = true
    } else if (MAIN_SECTIONS.has(path) && path !== '/favorites') {
      favoritesKeepAlive = false
    }

    const current = get()
    if (
      current.followingKeepAlive !== followingKeepAlive ||
      current.favoritesKeepAlive !== favoritesKeepAlive
    ) {
      set({ followingKeepAlive, favoritesKeepAlive })
    }
  }
}))
