import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { createHash } from 'crypto'
import { session } from 'electron'
import { defaultHeaders, getCsrf, signParams } from './wbi'
import { appStore, getCookieString, isLoggedIn, setCookies } from '../store/app-store'
import type {
  AuthPollResult,
  FavFolder,
  FavResource,
  FollowTag,
  FollowingUp,
  FollowingsPage,
  QrLoginResult,
  UpProfile,
  UpRelation,
  UserInfo,
  VideoDetail,
  VideoItem,
  VideoPlayInfo,
  UpVideosPage
} from '@shared/types'

const COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'buvid3'] as const
const TV_APPKEY = '4409e2ce8ffd12b8'
const TV_APPSEC = '59b43e04ad6965f34319062b478f83dd'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class BiliApiService {
  private client: AxiosInstance
  private passportClient: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.bilibili.com',
      timeout: 15000
    })

    this.passportClient = axios.create({
      baseURL: 'https://passport.bilibili.com',
      timeout: 15000
    })

    this.client.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3()
      cfg.headers = {
        ...defaultHeaders(),
        ...cfg.headers,
        Cookie: getCookieString()
      } as typeof cfg.headers
      return cfg
    })
    this.passportClient.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3()
      cfg.headers = {
        ...defaultHeaders(),
        ...cfg.headers,
        Cookie: getCookieString()
      } as typeof cfg.headers
      return cfg
    })
  }

  private buildTvSignedParams(extra: Record<string, string | number>): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000)
    const params: Record<string, string> = {
      appkey: TV_APPKEY,
      ts: String(ts),
      ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value)]))
    }
    const query = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&')
    params.sign = createHash('md5').update(query + TV_APPSEC).digest('hex')
    return params
  }

  private toFormBody(params: Record<string, string>): URLSearchParams {
    return new URLSearchParams(Object.entries(params))
  }

  async getQrCode(): Promise<QrLoginResult> {
    await this.ensureBuvid3()

    const res = await this.passportClient.post(
      '/x/passport-tv-login/qrcode/auth_code',
      this.toFormBody(this.buildTvSignedParams({ local_id: 0 })),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true
      }
    )

    const data = res.data?.data as { url?: string; auth_code?: string } | undefined
    if (res.data?.code !== 0 || !data?.url || !data?.auth_code) {
      throw new Error(this.formatPassportError(res.data?.message, res.status))
    }

    return { url: data.url, qrcodeKey: data.auth_code }
  }

  async pollLogin(qrcodeKey: string): Promise<AuthPollResult> {
    const res = await this.passportClient.post(
      '/x/passport-tv-login/qrcode/poll',
      this.toFormBody(this.buildTvSignedParams({ auth_code: qrcodeKey, local_id: 0 })),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true
      }
    )

    if (res.status === 412 || res.data?.code === -412) {
      return {
        status: 'failed',
        message: '请求被 B 站安全策略拦截，请稍后重试或更换网络'
      }
    }

    const code = res.data?.code as number | undefined
    if (code === 86038) return { status: 'expired' }
    if (code === 86039) return { status: 'waiting' }
    if (code === 86090) return { status: 'scanned' }

    if (code === 0 && res.data?.data) {
      await this.applyCookiesFromTvLogin(res.data.data)

      const refreshToken = res.data.data.refresh_token as string | undefined
      if (refreshToken) {
        appStore.set('refreshToken', refreshToken)
      }

      const user = await this.fetchCurrentUser()
      if (!user?.isLogin) {
        return {
          status: 'failed',
          message: '登录成功但未能读取用户信息，请重试'
        }
      }
      return { status: 'confirmed', user }
    }

    if (code !== undefined && code !== 0) {
      return {
        status: 'failed',
        message: this.formatPassportError(res.data?.message, res.status)
      }
    }

    return { status: 'waiting' }
  }

  private formatPassportError(message: unknown, status?: number): string {
    const text = typeof message === 'string' && message.trim() ? message : ''
    if (status === 412 || text.includes('banned')) {
      return '请求被 B 站安全策略拦截，请稍后重试或更换网络'
    }
    return text || '登录请求失败，请重试'
  }

  private async applyCookiesFromTvLogin(data: {
    cookie_info?: { cookies?: Array<{ name: string; value: string }> }
    mid?: number
  }): Promise<void> {
    const cookies = data.cookie_info?.cookies ?? []
    const map: Partial<Record<(typeof COOKIE_KEYS)[number], string>> = {}

    for (const cookie of cookies) {
      if ((COOKIE_KEYS as readonly string[]).includes(cookie.name)) {
        map[cookie.name as (typeof COOKIE_KEYS)[number]] = cookie.value
      }
    }

    if (map.SESSDATA) {
      appStore.set('cookies', { ...appStore.get('cookies'), ...map })
      await this.applyCookiesToSession()
    }
  }

  private async finalizeLogin(crossUrl: string | undefined, pollRes: AxiosResponse): Promise<void> {
    this.parseCookiesFromHeaders(pollRes)

    if (crossUrl) {
      const decoded = crossUrl.replace(/\\u0026/g, '&')
      this.parseCookiesFromCrossDomainUrl(decoded)

      try {
        const crossRes = await axios.get(decoded, {
          headers: defaultHeaders(),
          maxRedirects: 5,
          validateStatus: () => true
        })
        this.parseCookiesFromHeaders(crossRes)
      } catch {
        // crossDomain request is best-effort
      }
    }

    await this.syncCookiesFromSession()
    await this.applyCookiesToSession()
  }

  private parseCookiesFromCrossDomainUrl(crossUrl: string): void {
    try {
      const query = crossUrl.includes('?') ? crossUrl.split('?')[1] : crossUrl
      const params = new URLSearchParams(query)
      let SESSDATA = params.get('SESSDATA')

      if (!SESSDATA) {
        const match = query.match(/SESSDATA=([^&]+)/)
        SESSDATA = match ? decodeURIComponent(match[1]) : null
      }

      if (!SESSDATA) return

      const readParam = (key: string): string | null => {
        const value = params.get(key)
        if (value) return value
        const match = query.match(new RegExp(`${key}=([^&]+)`))
        return match ? decodeURIComponent(match[1]) : null
      }

      appStore.set('cookies', {
        ...appStore.get('cookies'),
        SESSDATA,
        bili_jct: readParam('bili_jct') ?? appStore.get('cookies').bili_jct,
        DedeUserID: readParam('DedeUserID') ?? appStore.get('cookies').DedeUserID,
        DedeUserID__ckMd5:
          readParam('DedeUserID__ckMd5') ?? appStore.get('cookies').DedeUserID__ckMd5
      })
    } catch {
      // ignore malformed url
    }
  }

  private async applyCookiesToSession(): Promise<void> {
    const c = appStore.get('cookies')
    const pairs: Array<[string, string]> = [
      ['SESSDATA', c.SESSDATA],
      ['bili_jct', c.bili_jct],
      ['DedeUserID', c.DedeUserID],
      ['DedeUserID__ckMd5', c.DedeUserID__ckMd5],
      ['buvid3', c.buvid3]
    ]

    for (const [name, value] of pairs) {
      if (!value) continue
      await session.defaultSession.cookies.set({
        url: 'https://www.bilibili.com',
        name,
        value,
        domain: '.bilibili.com',
        path: '/',
        secure: true
      })
    }
  }

  private async syncCookiesFromSession(): Promise<void> {
    const urls = ['https://www.bilibili.com', 'https://passport.bilibili.com']
    const map: Partial<Record<(typeof COOKIE_KEYS)[number], string>> = {}

    for (const url of urls) {
      const cookies = await session.defaultSession.cookies.get({ url })
      for (const name of COOKIE_KEYS) {
        if (map[name]) continue
        const found = cookies.find((c) => c.name === name)
        if (found?.value) map[name] = found.value
      }
    }

    if (map.SESSDATA) {
      appStore.set('cookies', { ...appStore.get('cookies'), ...map })
    }
  }

  private parseCookiesFromHeaders(res: AxiosResponse): void {
    const setCookies = res.headers['set-cookie'] ?? []
    const map: Record<string, string> = {}
    for (const raw of setCookies) {
      const part = raw.split(';')[0]
      const eq = part.indexOf('=')
      if (eq === -1) continue
      const key = part.slice(0, eq).trim()
      const value = part.slice(eq + 1)
      map[key] = decodeURIComponent(value)
    }

    if (map.SESSDATA) {
      appStore.set('cookies', {
        ...appStore.get('cookies'),
        SESSDATA: map.SESSDATA,
        bili_jct: map.bili_jct ?? appStore.get('cookies').bili_jct,
        DedeUserID: map.DedeUserID ?? appStore.get('cookies').DedeUserID,
        DedeUserID__ckMd5: map.DedeUserID__ckMd5 ?? appStore.get('cookies').DedeUserID__ckMd5,
        buvid3: map.buvid3 ?? appStore.get('cookies').buvid3
      })
    }
  }

  async fetchCurrentUser(): Promise<UserInfo | null> {
    await this.ensureBuvid3()

    if (!isLoggedIn()) {
      return { mid: 0, name: '未登录', face: '', isLogin: false }
    }

    try {
      const res = await this.client.get('/x/web-interface/nav')
      const data = res.data?.data
      if (data?.isLogin) {
        const user: UserInfo = {
          mid: data.mid,
          name: data.uname,
          face: data.face,
          isLogin: true
        }
        appStore.set('user', user)
        return user
      }
    } catch {
      // fall through to cookie-based fallback
    }

    const dedeId = Number(appStore.get('cookies').DedeUserID)
    if (dedeId > 0) {
      const user: UserInfo = {
        mid: dedeId,
        name: `UID ${dedeId}`,
        face: '',
        isLogin: true
      }
      appStore.set('user', user)
      return user
    }

    return { mid: 0, name: '未登录', face: '', isLogin: false }
  }

  private async ensureBuvid3(): Promise<void> {
    if (appStore.get('cookies').buvid3) return

    try {
      const spiRes = await axios.get('https://api.bilibili.com/x/frontend/finger/spi', {
        headers: defaultHeaders(),
        timeout: 10000,
        validateStatus: () => true
      })
      const b3 = spiRes.data?.data?.b_3 as string | undefined
      if (b3) {
        setCookies({ buvid3: b3 })
        return
      }
    } catch {
      // fallback below
    }

    try {
      const res = await axios.get('https://www.bilibili.com/', {
        headers: defaultHeaders(),
        maxRedirects: 0,
        validateStatus: (s) => s < 400
      })
      this.parseCookiesFromHeaders(res)
      await this.syncCookiesFromSession()
    } catch {
      // ignore
    }
  }

  async getRecommend(options?: {
    freshIdx?: number
    freshIdx1h?: number
    ps?: number
  }): Promise<{ videos: VideoItem[]; freshIdx: number; hasMore: boolean }> {
    await this.ensureBuvid3()

    const freshIdx = options?.freshIdx ?? 1
    const freshIdx1h = options?.freshIdx1h ?? freshIdx
    const ps = options?.ps ?? 20

    let items: unknown[] = []
    try {
      const params = await signParams({ ps, fresh_idx: freshIdx, fresh_idx_1h: freshIdx1h })
      const res = await this.client.get('/x/web-interface/wbi/index/top/feed/rcmd', { params })
      items = res.data?.data?.item ?? []
    } catch {
      const res = await this.client.get('/x/web-interface/index/top/feed/rcmd', {
        params: { ps, fresh_idx: freshIdx, fresh_idx_1h: freshIdx1h }
      })
      items = res.data?.data?.item ?? []
    }

    const videos = this.normalizeRecommendItems(items)
    return {
      videos,
      freshIdx: freshIdx + 1,
      hasMore: videos.length > 0
    }
  }

  private normalizeRecommendItems(items: unknown[]): VideoItem[] {
    return items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .filter((item) => item.bvid)
      .map((item) => this.normalizeVideo(item))
  }

  async getVideoBriefs(
    bvids: string[]
  ): Promise<Array<{ bvid: string; cover: string; upperName: string; duration: number }>> {
    await this.ensureBuvid3()
    const unique = [...new Set(bvids.filter(Boolean))]
    const results: Array<{ bvid: string; cover: string; upperName: string; duration: number }> = []

    for (let index = 0; index < unique.length; index++) {
      const bvid = unique[index]
      try {
        const params = await signParams({ bvid })
        const res = await this.client.get('/x/web-interface/wbi/view', { params })
        const view = res.data?.data as Record<string, unknown> | undefined
        if (res.data?.code !== 0 || !view?.bvid) continue

        results.push({
          bvid: view.bvid as string,
          cover: (view.pic as string) ?? '',
          upperName: ((view.owner as { name?: string })?.name ?? '') as string,
          duration: (view.duration as number) ?? 0
        })
      } catch {
        try {
          const res = await this.client.get('/x/web-interface/view', { params: { bvid } })
          const view = res.data?.data as Record<string, unknown> | undefined
          if (res.data?.code !== 0 || !view?.bvid) continue
          results.push({
            bvid: view.bvid as string,
            cover: (view.pic as string) ?? '',
            upperName: ((view.owner as { name?: string })?.name ?? '') as string,
            duration: (view.duration as number) ?? 0
          })
        } catch {
          // skip failed item
        }
      }

      if (index % 5 === 4) {
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }

    return results
  }

  async getVideo(bvid: string): Promise<VideoDetail> {
    await this.ensureBuvid3()
    const params = await signParams({ bvid })
    const viewRes = await this.client.get('/x/web-interface/wbi/view', { params })

    if (viewRes.data?.code !== 0) {
      throw new Error(viewRes.data?.message || '视频信息获取失败')
    }

    const view = viewRes.data?.data
    if (!view?.bvid) throw new Error('Video not found')

    return {
      bvid: view.bvid,
      aid: view.aid,
      title: view.title,
      cover: view.pic,
      duration: view.duration,
      play: view.stat?.view ?? 0,
      danmaku: view.stat?.danmaku ?? 0,
      owner: {
        mid: view.owner.mid,
        name: view.owner.name,
        face: view.owner.face
      },
      pubdate: view.pubdate,
      desc: view.desc ?? '',
      pages: (view.pages ?? []).map((part: Record<string, unknown>) => ({
        cid: part.cid as number,
        page: part.page as number,
        part: (part.part as string) || `P${part.page}`,
        duration: (part.duration as number) ?? 0
      })),
      stat: {
        view: view.stat?.view ?? 0,
        danmaku: view.stat?.danmaku ?? 0,
        reply: view.stat?.reply ?? 0,
        favorite: view.stat?.favorite ?? 0,
        coin: view.stat?.coin ?? 0,
        like: view.stat?.like ?? 0
      }
    }
  }

  async getPlayUrl(bvid: string, cid: number, qn = 64): Promise<VideoPlayInfo> {
    await this.ensureBuvid3()

    const params = await signParams({
      bvid,
      cid,
      qn,
      fnval: 0,
      fnver: 0,
      fourk: 1
    })

    const res = await this.client.get('/x/player/wbi/playurl', { params })
    if (res.data?.code !== 0) {
      throw new Error(res.data?.message || '播放地址获取失败')
    }

    const data = res.data?.data
    const stream = data?.durl?.[0] as { url?: string; format?: string } | undefined
    const url = stream?.url
    if (!url) {
      throw new Error('该视频暂不支持在线播放，可能为付费或受限内容')
    }

    const streamFormat = (stream?.format as string | undefined)?.toLowerCase() ?? ''
    const format: VideoPlayInfo['format'] =
      streamFormat.includes('flv') || url.includes('.flv') ? 'flv' : 'mp4'

    const acceptQuality = (data?.accept_quality as number[] | undefined) ?? [data?.quality ?? qn]
    const acceptDescription =
      (data?.accept_description as string[] | undefined) ??
      acceptQuality.map((value: number) => `${value}P`)

    const qualities = acceptQuality.map((value: number, index: number) => ({
      qn: value,
      label: acceptDescription[index] ?? `${value}P`
    }))

    const quality = (data?.quality as number) ?? qn
    const qualityIndex = acceptQuality.indexOf(quality)

    return {
      url,
      format,
      quality,
      qualityLabel: acceptDescription[qualityIndex] ?? `${quality}P`,
      qualities
    }
  }

  private mapFavMedias(medias: unknown[]): FavResource[] {
    return medias.map((m) => {
      const media = m as Record<string, unknown>
      return {
        id: media.id as number,
        bvid: (media.bvid as string) ?? '',
        title: media.title as string,
        cover: (media.cover as string) ?? '',
        upper: {
          mid: (media.upper as { mid: number })?.mid ?? 0,
          name: (media.upper as { name: string })?.name ?? ''
        },
        duration: (media.duration as number) ?? 0
      }
    })
  }

  private async fetchFavResourcePage(
    mediaId: number,
    page: number,
    pageSize: number
  ): Promise<{ medias: unknown[]; hasMore: boolean }> {
    await this.ensureBuvid3()

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await this.client.get('/x/v3/fav/resource/list', {
        params: {
          media_id: mediaId,
          pn: page,
          ps: pageSize,
          platform: 'web',
          mobi_app: 'web'
        },
        headers: { Referer: 'https://www.bilibili.com/' },
        validateStatus: () => true
      })

      const code = res.data?.code as number | undefined
      if (res.status === 412 || code === -412) {
        if (attempt < 4) {
          await sleep(600 * attempt)
          continue
        }
        throw new Error('请求被 B 站安全策略拦截，请稍后重试')
      }

      if (code !== 0) {
        throw new Error((res.data?.message as string) || '收藏列表获取失败')
      }

      const medias = res.data?.data?.medias ?? []
      const hasMore = res.data?.data?.has_more ?? medias.length >= pageSize
      return { medias, hasMore }
    }

    throw new Error('收藏列表获取失败，请稍后重试')
  }

  async getFavFolders(): Promise<FavFolder[]> {
    const mid = appStore.get('user')?.mid ?? Number(appStore.get('cookies').DedeUserID)
    if (!mid) return []

    await this.ensureBuvid3()

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await this.client.get('/x/v3/fav/folder/created/list-all', {
        params: { up_mid: mid },
        headers: { Referer: 'https://www.bilibili.com/' },
        validateStatus: () => true
      })

      if (res.status === 412 || res.data?.code === -412) {
        if (attempt < 3) {
          await sleep(600 * attempt)
          continue
        }
        throw new Error('请求被 B 站安全策略拦截，请稍后重试')
      }

      if (res.data?.code !== 0) {
        throw new Error((res.data?.message as string) || '收藏夹列表获取失败')
      }

      const list = res.data?.data?.list ?? []
      return list.map((f: Record<string, unknown>) => ({
        id: f.id as number,
        fid: f.fid as number,
        title: f.title as string,
        mediaCount: (f.media_count as number) ?? 0,
        cover: (f.cover as string) ?? ''
      }))
    }

    return []
  }

  async getFavResources(mediaId: number, page = 1, pageSize = 20): Promise<{
    resources: FavResource[]
    page: number
    hasMore: boolean
  }> {
    const { medias, hasMore } = await this.fetchFavResourcePage(mediaId, page, pageSize)
    return {
      resources: this.mapFavMedias(medias),
      page,
      hasMore
    }
  }

  async getAllFavResourcesInFolder(
    mediaId: number,
    onPage?: (fetchedCount: number) => void | Promise<void>
  ): Promise<FavResource[]> {
    const pageSize = 40
    const all: FavResource[] = []
    let page = 1

    while (true) {
      const { medias, hasMore } = await this.fetchFavResourcePage(mediaId, page, pageSize)
      if (medias.length === 0) break

      all.push(...this.mapFavMedias(medias))
      await onPage?.(all.length)

      if (!hasMore) break
      page++
      await sleep(350)
    }

    return all
  }

  async getAllFavResources(): Promise<FavResource[]> {
    const folders = await this.getFavFolders()
    const seen = new Set<number>()
    const all: FavResource[] = []

    for (const folder of folders) {
      const items = await this.getAllFavResourcesInFolder(folder.id)
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        all.push(item)
      }
    }

    return all
  }

  async getFollowings(page = 1): Promise<FollowingUp[]> {
    const mid = appStore.get('user')?.mid
    if (!mid) return []

    const res = await this.client.get('/x/relation/followings', {
      params: { vmid: mid, pn: page, ps: 50, order: 'desc' }
    })

    const list = res.data?.data?.list ?? []
    return list.map((u: Record<string, unknown>) => this.mapFollowingUser(u))
  }

  async getAllFollowings(): Promise<FollowingUp[]> {
    const all: FollowingUp[] = []
    let page = 1

    while (true) {
      const batch = await this.getFollowings(page)
      if (batch.length === 0) break
      all.push(...batch)
      if (batch.length < 50) break
      page++
    }

    return all
  }

  async getFollowTags(): Promise<FollowTag[]> {
    if (!isLoggedIn()) return []

    await this.ensureBuvid3()

    const res = await this.client.get('/x/relation/tags', {
      headers: { Referer: 'https://space.bilibili.com/' },
      validateStatus: () => true
    })

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || '关注分组列表获取失败')
    }

    const list = res.data?.data ?? []
    return list.map((tag: Record<string, unknown>) => ({
      tagId: tag.tagid as number,
      name: tag.name as string,
      count: (tag.count as number) ?? 0
    }))
  }

  async getFollowingsInTag(tagId: number, page = 1, pageSize = 50): Promise<FollowingsPage> {
    if (!isLoggedIn()) {
      return { followings: [], page: 1, hasMore: false }
    }

    await this.ensureBuvid3()

    const res = await this.client.get('/x/relation/tag', {
      params: { tagid: tagId, pn: page, ps: pageSize },
      headers: { Referer: 'https://space.bilibili.com/' },
      validateStatus: () => true
    })

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || '关注分组成员获取失败')
    }

    const list = res.data?.data ?? []
    const followings = list.map((u: Record<string, unknown>) => this.mapFollowingUser(u))

    return {
      followings,
      page,
      hasMore: followings.length >= pageSize
    }
  }

  private mapFollowingUser(u: Record<string, unknown>): FollowingUp {
    const official = u.official as { role?: number; title?: string } | undefined
    const officialVerify = u.official_verify as { type?: number; desc?: string } | undefined
    const attribute = (u.attribute as number) ?? 0

    return {
      mid: u.mid as number,
      uname: u.uname as string,
      face: u.face as string,
      sign: (u.sign as string) ?? '',
      official: {
        role: official?.role ?? officialVerify?.type ?? 0,
        title: official?.title ?? officialVerify?.desc ?? ''
      },
      special: (u.special as number) === 1,
      mutual: attribute === 6
    }
  }

  private async postRelationForm(path: string, fields: Record<string, string>): Promise<void> {
    const csrf = getCsrf()
    if (!csrf) throw new Error('请先登录后再操作')

    const res = await this.client.post(path, new URLSearchParams({ ...fields, csrf }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://space.bilibili.com/'
      }
    })

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || '操作失败')
    }
  }

  async getUserFollowTags(mid: number): Promise<number[]> {
    if (!isLoggedIn()) return []

    await this.ensureBuvid3()

    const res = await this.client.get('/x/relation/tag/user', {
      params: { fid: mid },
      headers: { Referer: 'https://space.bilibili.com/' }
    })

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || '获取分组失败')
    }

    const data = (res.data?.data as Record<string, string>) ?? {}
    return Object.keys(data).map((key) => Number(key))
  }

  async setUserFollowTags(mid: number, tagIds: number[]): Promise<void> {
    if (!isLoggedIn()) throw new Error('请先登录后再操作')

    const current = await this.getUserFollowTags(mid)
    const nextSet = new Set(tagIds)
    const toAdd = tagIds.filter((id) => !current.includes(id))
    const toRemove = current.filter((id) => !nextSet.has(id) && id !== 0)

    for (const tagId of toRemove) {
      await this.postRelationForm('/x/relation/tags/delUsers', {
        tagids: String(tagId),
        fids: String(mid)
      })
    }

    if (toAdd.length > 0) {
      await this.postRelationForm('/x/relation/tags/addUsers', {
        fids: String(mid),
        tagids: toAdd.join(',')
      })
    }
  }

  async getUpProfile(mid: number): Promise<UpProfile> {
    await this.ensureBuvid3()

    const [cardRes, statRes] = await Promise.all([
      this.client.get('/x/web-interface/card', { params: { mid, photo: true } }),
      this.client.get('/x/relation/stat', { params: { vmid: mid } })
    ])

    if (cardRes.data?.code !== 0) {
      throw new Error(cardRes.data?.message || 'UP 主信息获取失败')
    }

    const payload = cardRes.data?.data as Record<string, unknown> | undefined
    const card = payload?.card as Record<string, unknown> | undefined
    const stat = statRes.data?.data as Record<string, unknown> | undefined

    return {
      mid,
      name: (card?.name as string) ?? '',
      face: (card?.face as string) ?? '',
      sign: (card?.sign as string) ?? '',
      fans: (stat?.follower as number) ?? (payload?.follower as number) ?? (card?.fans as number) ?? 0,
      following: (stat?.following as number) ?? 0,
      videos: (payload?.archive_count as number) ?? 0
    }
  }

  async getUpRelation(mid: number): Promise<UpRelation> {
    if (!isLoggedIn()) {
      return { isFollowing: false, attribute: 0 }
    }

    const res = await this.client.get('/x/relation', { params: { fid: mid } })
    if (res.data?.code !== 0) {
      return { isFollowing: false, attribute: 0 }
    }

    const attribute = (res.data?.data?.attribute as number) ?? 0
    return {
      isFollowing: attribute === 1 || attribute === 2 || attribute === 6,
      attribute
    }
  }

  async modifyFollow(mid: number, follow: boolean): Promise<void> {
    const csrf = getCsrf()
    if (!csrf) throw new Error('请先登录后再关注')

    const res = await this.client.post(
      '/x/relation/modify',
      new URLSearchParams({
        fid: String(mid),
        act: follow ? '1' : '2',
        re_src: '11',
        csrf
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    if (res.data?.code !== 0) {
      throw new Error(res.data?.message || '关注操作失败')
    }
  }

  async getRecentVideoTitles(mid: number, limit = 5): Promise<string[]> {
    const page = await this.getUpVideos(mid, 1)
    return page.videos.slice(0, limit).map((video) => video.title)
  }

  async getUpVideos(mid: number, page = 1): Promise<UpVideosPage> {
    await this.ensureBuvid3()

    if (!isLoggedIn()) {
      throw new Error('请先登录后查看 UP 主投稿')
    }

    try {
      return await this.fetchSpaceArcList(mid, page)
    } catch (primaryError) {
      try {
        const profile = await this.getUpProfile(mid)
        const fallback = await this.fetchUpVideosBySearch(mid, profile.name, page)
        if (fallback.videos.length > 0) return fallback
      } catch {
        // use primary error below
      }

      throw primaryError instanceof Error
        ? primaryError
        : new Error('投稿列表获取失败，请稍后重试')
    }
  }

  private async fetchSpaceArcList(mid: number, page: number): Promise<UpVideosPage> {
    const referer = 'https://www.bilibili.com/'

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await this.client.get('/x/space/arc/search', {
        params: {
          mid,
          pn: page,
          ps: 30,
          tid: 0,
          keyword: '',
          order: 'pubdate'
        },
        headers: { Referer: referer },
        validateStatus: () => true
      })

      const payload = res.data
      const code = payload?.code as number | undefined
      if (code === 0) {
        const vlist = (payload?.data?.list?.vlist ?? []) as Record<string, unknown>[]
        const pageInfo = payload?.data?.page as { count?: number; pn?: number; ps?: number } | undefined
        const total = pageInfo?.count ?? vlist.length
        const pageSize = pageInfo?.ps ?? 30
        return {
          videos: vlist.map((item) => this.normalizeSpaceVideo(item, mid)),
          page,
          total,
          hasMore: page * pageSize < total
        }
      }

      if ((code === -799 || code === -412) && attempt < 3) {
        await sleep(1000 * attempt)
        continue
      }

      if (code === -799) {
        throw new Error('请求过于频繁，请稍后再试')
      }
      throw new Error('投稿列表获取失败，请稍后重试')
    }

    throw new Error('投稿列表获取失败，请稍后重试')
  }

  private async fetchUpVideosBySearch(
    mid: number,
    upName: string,
    page: number
  ): Promise<UpVideosPage> {
    if (!upName.trim()) {
      return { videos: [], page, hasMore: false, total: 0 }
    }

    const params = await signParams({
      search_type: 'video',
      keyword: upName,
      page,
      page_size: 30,
      order: 'pubdate',
      platform: 'pc',
      single_column: 0,
      source: ''
    })

    const res = await this.client.get('/x/web-interface/wbi/search/type', {
      params,
      headers: { Referer: 'https://www.bilibili.com/' },
      validateStatus: () => true
    })

    if (res.data?.code !== 0) {
      return { videos: [], page, hasMore: false, total: 0 }
    }

    const results = (res.data?.data?.result ?? []) as Record<string, unknown>[]
    const videos = results
      .filter((item) => item.mid === mid)
      .map((item) => this.normalizeSearchVideo(item, mid))

    return {
      videos,
      page,
      total: videos.length,
      hasMore: videos.length >= 30
    }
  }

  logout(): void {
    appStore.set('cookies', {
      SESSDATA: '',
      bili_jct: '',
      DedeUserID: '',
      DedeUserID__ckMd5: '',
      buvid3: appStore.get('cookies').buvid3 ?? ''
    })
    appStore.set('user', null)
    appStore.set('refreshToken', '')
  }

  getAuthStatus(): UserInfo {
    const user = appStore.get('user')
    if (user?.isLogin) return user
    return { mid: 0, name: '未登录', face: '', isLogin: false }
  }

  private normalizeVideo(item: Record<string, unknown>): VideoItem {
    const owner = item.owner as Record<string, unknown> | undefined
    return {
      bvid: item.bvid as string,
      aid: (item.id as number) ?? 0,
      title: item.title as string,
      cover: (item.pic as string) ?? '',
      duration: (item.duration as number) ?? 0,
      play: (item.stat as { view?: number })?.view ?? 0,
      danmaku: (item.stat as { danmaku?: number })?.danmaku ?? 0,
      owner: {
        mid: (owner?.mid as number) ?? 0,
        name: (owner?.name as string) ?? '',
        face: (owner?.face as string) ?? ''
      },
      pubdate: (item.pubdate as number) ?? 0
    }
  }

  private normalizeSpaceVideo(item: Record<string, unknown>, mid: number): VideoItem {
    return {
      bvid: item.bvid as string,
      aid: (item.aid as number) ?? 0,
      title: item.title as string,
      cover: ((item.pic as string) ?? '').replace(/^http:/, 'https:'),
      duration: (item.length as number) ?? 0,
      play: (item.play as number) ?? 0,
      danmaku: (item.video_review as number) ?? 0,
      owner: {
        mid,
        name: (item.author as string) ?? '',
        face: ''
      },
      pubdate: (item.created as number) ?? 0
    }
  }

  private normalizeSearchVideo(item: Record<string, unknown>, mid: number): VideoItem {
    const durationText = item.duration as string | undefined
    let duration = 0
    if (durationText?.includes(':')) {
      const parts = durationText.split(':').map(Number)
      if (parts.length === 2) duration = parts[0] * 60 + parts[1]
      if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
    }

    const title = String(item.title ?? '')
      .replace(/<em class="keyword">/g, '')
      .replace(/<\/em>/g, '')

    return {
      bvid: item.bvid as string,
      aid: (item.aid as number) ?? 0,
      title,
      cover: ((item.pic as string) ?? '').replace(/^http:/, 'https:'),
      duration,
      play: (item.play as number) ?? 0,
      danmaku: (item.video_review as number) ?? 0,
      owner: {
        mid,
        name: (item.author as string) ?? '',
        face: ''
      },
      pubdate: (item.pubdate as number) ?? 0
    }
  }
}

export const biliApi = new BiliApiService()
