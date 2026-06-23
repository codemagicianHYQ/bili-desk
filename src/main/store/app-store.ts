import Store from 'electron-store'
import type { AiConfig, Theme, UserInfo } from '@shared/types'

interface StoreSchema {
  theme: Theme
  cookies: {
    SESSDATA: string
    bili_jct: string
    DedeUserID: string
    DedeUserID__ckMd5: string
    buvid3: string
  }
  user: UserInfo | null
  ai: AiConfig
  refreshToken: string
  localDb: unknown
}

const defaults: StoreSchema = {
  theme: 'dark',
  cookies: {
    SESSDATA: '',
    bili_jct: '',
    DedeUserID: '',
    DedeUserID__ckMd5: '',
    buvid3: ''
  },
  user: null,
  refreshToken: '',
  ai: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  }
}

export const appStore = new Store<StoreSchema>({
  name: 'bilidesk-config',
  defaults
})

export function getCookieString(): string {
  const c = appStore.get('cookies')
  const parts: string[] = []
  if (c.SESSDATA) parts.push(`SESSDATA=${c.SESSDATA}`)
  if (c.bili_jct) parts.push(`bili_jct=${c.bili_jct}`)
  if (c.DedeUserID) parts.push(`DedeUserID=${c.DedeUserID}`)
  if (c.DedeUserID__ckMd5) parts.push(`DedeUserID__ckMd5=${c.DedeUserID__ckMd5}`)
  if (c.buvid3) parts.push(`buvid3=${c.buvid3}`)
  return parts.join('; ')
}

export function setCookies(cookies: Partial<StoreSchema['cookies']>): void {
  appStore.set('cookies', { ...appStore.get('cookies'), ...cookies })
}

export function clearAuth(): void {
  appStore.set('cookies', defaults.cookies)
  appStore.set('user', null)
}

export function isLoggedIn(): boolean {
  return Boolean(appStore.get('cookies').SESSDATA)
}
