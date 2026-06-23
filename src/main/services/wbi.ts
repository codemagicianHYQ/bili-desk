import axios from 'axios'
import { createHash } from 'crypto'
import { session } from 'electron'
import { appStore, getCookieString, setCookies } from '../store/app-store'

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 38, 57, 39, 59, 48, 42, 54, 22,
  41, 19, 24, 13, 49, 29, 36, 16, 26, 21, 44, 56, 7, 55, 43, 40, 51, 12, 33, 37, 17, 28, 9, 25,
  14, 6, 34, 1, 52, 11, 30, 4, 20, 5, 27, 0
]

let cachedKeys: { imgKey: string; subKey: string; expires: number } | null = null

interface NavResponse {
  code?: number
  message?: string
  data?: {
    wbi_img?: {
      img_url?: string
      sub_url?: string
    }
  }
}

function extractWbiKey(url: string): string {
  const filename = url.slice(url.lastIndexOf('/') + 1)
  return filename.replace(/\.(jpg|jpeg|png|webp).*$/i, '').split('@')[0]
}

async function ensureBuvid3ForWbi(): Promise<void> {
  if (appStore.get('cookies').buvid3) return

  try {
    const res = await axios.get('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: defaultHeaders(),
      timeout: 10000,
      validateStatus: () => true
    })
    const b3 = res.data?.data?.b_3 as string | undefined
    if (b3) setCookies({ buvid3: b3 })
  } catch {
    // ignore
  }
}

async function fetchNavWbiImg(): Promise<{ img_url: string; sub_url: string }> {
  await ensureBuvid3ForWbi()

  const headers = {
    ...defaultHeaders(),
    Accept: 'application/json, text/plain, */*',
    Cookie: getCookieString()
  }

  let lastError = 'unknown error'

  try {
    const res = await session.defaultSession.fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers
    })
    const json = (await res.json()) as NavResponse
    const wbiImg = json?.data?.wbi_img
    if (wbiImg?.img_url && wbiImg?.sub_url) {
      return { img_url: wbiImg.img_url, sub_url: wbiImg.sub_url }
    }
    lastError = `nav fetch status ${res.status}, code ${json?.code ?? 'n/a'}: ${json?.message ?? 'missing wbi_img'}`
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  try {
    const res = await axios.get<NavResponse>('https://api.bilibili.com/x/web-interface/nav', {
      headers,
      timeout: 10000,
      validateStatus: () => true
    })
    const wbiImg = res.data?.data?.wbi_img
    if (wbiImg?.img_url && wbiImg?.sub_url) {
      return { img_url: wbiImg.img_url, sub_url: wbiImg.sub_url }
    }
    lastError = `nav axios code ${res.data?.code ?? 'n/a'}: ${res.data?.message ?? 'missing wbi_img'}`
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  throw new Error(`Failed to fetch WBI keys (${lastError})`)
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (cachedKeys && Date.now() < cachedKeys.expires) {
    return { imgKey: cachedKeys.imgKey, subKey: cachedKeys.subKey }
  }

  const wbiImg = await fetchNavWbiImg()
  const imgKey = extractWbiKey(wbiImg.img_url)
  const subKey = extractWbiKey(wbiImg.sub_url)

  if (!imgKey || !subKey) {
    throw new Error('Failed to parse WBI keys from nav response')
  }

  cachedKeys = { imgKey, subKey, expires: Date.now() + 30 * 60 * 1000 }
  return { imgKey, subKey }
}

function encWbi(params: Record<string, string | number>, imgKey: string, subKey: string): string {
  const mixinKey = MIXIN_KEY_ENC_TAB.map((n) => (imgKey + subKey)[n]).join('').slice(0, 32)
  const sorted = Object.keys(params).sort()
  const pairs = sorted.map((key) => {
    const value = String(params[key]).replace(/[!'()*]/g, '')
    return `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '%20')}`
  })
  const query = pairs.join('&')
  return createHash('md5').update(query + mixinKey).digest('hex')
}

export function defaultHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com'
  }
}

export function invalidateWbiCache(): void {
  cachedKeys = null
}

export async function signParams(
  params: Record<string, string | number>
): Promise<Record<string, string | number>> {
  const { imgKey, subKey } = await getWbiKeys()
  const wts = Math.floor(Date.now() / 1000)
  const signed = { ...params, wts }
  const w_rid = encWbi(signed, imgKey, subKey)
  return { ...signed, w_rid }
}

export function getCsrf(): string {
  return appStore.get('cookies').bili_jct
}
