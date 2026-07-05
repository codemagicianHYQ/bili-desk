import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { createHash } from "crypto";
import { session } from "electron";
import { defaultHeaders, getCsrf, signParams } from "./wbi";
import { buildDashMpdUri } from "@shared/utils/bilibili-dash";
import {
  appStore,
  getCookieString,
  isLoggedIn,
  setCookies,
} from "../store/app-store";
import type {
  AuthPollResult,
  FavFolder,
  FavResource,
  VideoFavFolder,
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
  UpVideosPage,
  SearchOrder,
  SearchVideosPage,
  ToViewItem,
  ToViewList,
  SpaceDynamicItem,
  SpaceDynamicPage,
  UserCollectionItem,
  UserCollectionsPage,
  BangumiFollowItem,
  BangumiFollowPage,
  FavMediaItem,
  FavMediasPage,
  OpusFavItem,
  OpusFavPage,
  CheeseCourseItem,
  CheeseCoursePage,
} from "@shared/types";

const COOKIE_KEYS = [
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "buvid3",
] as const;
const TV_APPKEY = "4409e2ce8ffd12b8";
const TV_APPSEC = "59b43e04ad6965f34319062b478f83dd";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BiliApiService {
  private client: AxiosInstance;
  private passportClient: AxiosInstance;
  private memberClient: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api.bilibili.com",
      timeout: 15000,
    });

    this.passportClient = axios.create({
      baseURL: "https://passport.bilibili.com",
      timeout: 15000,
    });

    this.memberClient = axios.create({
      baseURL: "https://member.bilibili.com",
      timeout: 15000,
    });

    this.client.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3();
      cfg.headers = {
        ...defaultHeaders(),
        ...cfg.headers,
        Cookie: getCookieString(),
      } as typeof cfg.headers;
      return cfg;
    });
    this.passportClient.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3();
      cfg.headers = {
        ...defaultHeaders(),
        ...cfg.headers,
        Cookie: getCookieString(),
      } as typeof cfg.headers;
      return cfg;
    });
    this.memberClient.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3();
      cfg.headers = {
        ...defaultHeaders(),
        ...cfg.headers,
        Cookie: getCookieString(),
      } as typeof cfg.headers;
      return cfg;
    });
  }

  private buildTvSignedParams(
    extra: Record<string, string | number>,
  ): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      appkey: TV_APPKEY,
      ts: String(ts),
      ...Object.fromEntries(
        Object.entries(extra).map(([key, value]) => [key, String(value)]),
      ),
    };
    const query = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    params.sign = createHash("md5")
      .update(query + TV_APPSEC)
      .digest("hex");
    return params;
  }

  private toFormBody(params: Record<string, string>): URLSearchParams {
    return new URLSearchParams(Object.entries(params));
  }

  async getQrCode(): Promise<QrLoginResult> {
    await this.ensureBuvid3();

    const res = await this.passportClient.post(
      "/x/passport-tv-login/qrcode/auth_code",
      this.toFormBody(this.buildTvSignedParams({ local_id: 0 })),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    const data = res.data?.data as
      | { url?: string; auth_code?: string }
      | undefined;
    if (res.data?.code !== 0 || !data?.url || !data?.auth_code) {
      throw new Error(this.formatPassportError(res.data?.message, res.status));
    }

    return { url: data.url, qrcodeKey: data.auth_code };
  }

  async pollLogin(qrcodeKey: string): Promise<AuthPollResult> {
    const res = await this.passportClient.post(
      "/x/passport-tv-login/qrcode/poll",
      this.toFormBody(
        this.buildTvSignedParams({ auth_code: qrcodeKey, local_id: 0 }),
      ),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      return {
        status: "failed",
        message: "请求被 B 站安全策略拦截，请稍后重试或更换网络",
      };
    }

    const code = res.data?.code as number | undefined;
    if (code === 86038) return { status: "expired" };
    if (code === 86039) return { status: "waiting" };
    if (code === 86090) return { status: "scanned" };

    if (code === 0 && res.data?.data) {
      await this.applyCookiesFromTvLogin(res.data.data);

      const refreshToken = res.data.data.refresh_token as string | undefined;
      if (refreshToken) {
        appStore.set("refreshToken", refreshToken);
      }

      const user = await this.fetchCurrentUser();
      if (!user?.isLogin) {
        return {
          status: "failed",
          message: "登录成功但未能读取用户信息，请重试",
        };
      }
      return { status: "confirmed", user };
    }

    if (code !== undefined && code !== 0) {
      return {
        status: "failed",
        message: this.formatPassportError(res.data?.message, res.status),
      };
    }

    return { status: "waiting" };
  }

  private formatPassportError(message: unknown, status?: number): string {
    const text = typeof message === "string" && message.trim() ? message : "";
    if (status === 412 || text.includes("banned")) {
      return "请求被 B 站安全策略拦截，请稍后重试或更换网络";
    }
    return text || "登录请求失败，请重试";
  }

  private async applyCookiesFromTvLogin(data: {
    cookie_info?: { cookies?: Array<{ name: string; value: string }> };
    mid?: number;
  }): Promise<void> {
    const cookies = data.cookie_info?.cookies ?? [];
    const map: Partial<Record<(typeof COOKIE_KEYS)[number], string>> = {};

    for (const cookie of cookies) {
      if ((COOKIE_KEYS as readonly string[]).includes(cookie.name)) {
        map[cookie.name as (typeof COOKIE_KEYS)[number]] = cookie.value;
      }
    }

    if (map.SESSDATA) {
      appStore.set("cookies", { ...appStore.get("cookies"), ...map });
      await this.applyCookiesToSession();
    }
  }

  private async finalizeLogin(
    crossUrl: string | undefined,
    pollRes: AxiosResponse,
  ): Promise<void> {
    this.parseCookiesFromHeaders(pollRes);

    if (crossUrl) {
      const decoded = crossUrl.replace(/\\u0026/g, "&");
      this.parseCookiesFromCrossDomainUrl(decoded);

      try {
        const crossRes = await axios.get(decoded, {
          headers: defaultHeaders(),
          maxRedirects: 5,
          validateStatus: () => true,
        });
        this.parseCookiesFromHeaders(crossRes);
      } catch {
        // crossDomain request is best-effort
      }
    }

    await this.syncCookiesFromSession();
    await this.applyCookiesToSession();
  }

  private parseCookiesFromCrossDomainUrl(crossUrl: string): void {
    try {
      const query = crossUrl.includes("?") ? crossUrl.split("?")[1] : crossUrl;
      const params = new URLSearchParams(query);
      let SESSDATA = params.get("SESSDATA");

      if (!SESSDATA) {
        const match = query.match(/SESSDATA=([^&]+)/);
        SESSDATA = match ? decodeURIComponent(match[1]) : null;
      }

      if (!SESSDATA) return;

      const readParam = (key: string): string | null => {
        const value = params.get(key);
        if (value) return value;
        const match = query.match(new RegExp(`${key}=([^&]+)`));
        return match ? decodeURIComponent(match[1]) : null;
      };

      appStore.set("cookies", {
        ...appStore.get("cookies"),
        SESSDATA,
        bili_jct: readParam("bili_jct") ?? appStore.get("cookies").bili_jct,
        DedeUserID:
          readParam("DedeUserID") ?? appStore.get("cookies").DedeUserID,
        DedeUserID__ckMd5:
          readParam("DedeUserID__ckMd5") ??
          appStore.get("cookies").DedeUserID__ckMd5,
      });
    } catch {
      // ignore malformed url
    }
  }

  private async applyCookiesToSession(): Promise<void> {
    const c = appStore.get("cookies");
    const pairs: Array<[string, string]> = [
      ["SESSDATA", c.SESSDATA],
      ["bili_jct", c.bili_jct],
      ["DedeUserID", c.DedeUserID],
      ["DedeUserID__ckMd5", c.DedeUserID__ckMd5],
      ["buvid3", c.buvid3],
    ];

    for (const [name, value] of pairs) {
      if (!value) continue;
      await session.defaultSession.cookies.set({
        url: "https://www.bilibili.com",
        name,
        value,
        domain: ".bilibili.com",
        path: "/",
        secure: true,
      });
    }
  }

  private async syncCookiesFromSession(): Promise<void> {
    const urls = ["https://www.bilibili.com", "https://passport.bilibili.com"];
    const map: Partial<Record<(typeof COOKIE_KEYS)[number], string>> = {};

    for (const url of urls) {
      const cookies = await session.defaultSession.cookies.get({ url });
      for (const name of COOKIE_KEYS) {
        if (map[name]) continue;
        const found = cookies.find((c) => c.name === name);
        if (found?.value) map[name] = found.value;
      }
    }

    if (map.SESSDATA) {
      appStore.set("cookies", { ...appStore.get("cookies"), ...map });
    }
  }

  private parseCookiesFromHeaders(res: AxiosResponse): void {
    const setCookies = res.headers["set-cookie"] ?? [];
    const map: Record<string, string> = {};
    for (const raw of setCookies) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1);
      map[key] = decodeURIComponent(value);
    }

    if (map.SESSDATA) {
      appStore.set("cookies", {
        ...appStore.get("cookies"),
        SESSDATA: map.SESSDATA,
        bili_jct: map.bili_jct ?? appStore.get("cookies").bili_jct,
        DedeUserID: map.DedeUserID ?? appStore.get("cookies").DedeUserID,
        DedeUserID__ckMd5:
          map.DedeUserID__ckMd5 ?? appStore.get("cookies").DedeUserID__ckMd5,
        buvid3: map.buvid3 ?? appStore.get("cookies").buvid3,
      });
    }
  }

  async fetchCurrentUser(): Promise<UserInfo | null> {
    await this.ensureBuvid3();

    if (!isLoggedIn()) {
      return { mid: 0, name: "未登录", face: "", isLogin: false };
    }

    try {
      const res = await this.client.get("/x/web-interface/nav");
      const data = res.data?.data;
      if (data?.isLogin) {
        const user: UserInfo = {
          mid: data.mid,
          name: data.uname,
          face: data.face,
          isLogin: true,
        };
        appStore.set("user", user);
        return user;
      }
    } catch {
      // fall through to cookie-based fallback
    }

    const dedeId = Number(appStore.get("cookies").DedeUserID);
    if (dedeId > 0) {
      const user: UserInfo = {
        mid: dedeId,
        name: `UID ${dedeId}`,
        face: "",
        isLogin: true,
      };
      appStore.set("user", user);
      return user;
    }

    return { mid: 0, name: "未登录", face: "", isLogin: false };
  }

  private async ensureBuvid3(): Promise<void> {
    if (appStore.get("cookies").buvid3) return;

    try {
      const spiRes = await axios.get(
        "https://api.bilibili.com/x/frontend/finger/spi",
        {
          headers: defaultHeaders(),
          timeout: 10000,
          validateStatus: () => true,
        },
      );
      const b3 = spiRes.data?.data?.b_3 as string | undefined;
      if (b3) {
        setCookies({ buvid3: b3 });
        return;
      }
    } catch {
      // fallback below
    }

    try {
      const res = await axios.get("https://www.bilibili.com/", {
        headers: defaultHeaders(),
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
      });
      this.parseCookiesFromHeaders(res);
      await this.syncCookiesFromSession();
    } catch {
      // ignore
    }
  }

  async getRecommend(options?: {
    freshIdx?: number;
    freshIdx1h?: number;
    ps?: number;
  }): Promise<{ videos: VideoItem[]; freshIdx: number; hasMore: boolean }> {
    await this.ensureBuvid3();

    const freshIdx = options?.freshIdx ?? 1;
    const freshIdx1h = options?.freshIdx1h ?? freshIdx;
    const ps = options?.ps ?? 20;

    let items: unknown[] = [];
    try {
      const params = await signParams({
        ps,
        fresh_idx: freshIdx,
        fresh_idx_1h: freshIdx1h,
      });
      const res = await this.client.get(
        "/x/web-interface/wbi/index/top/feed/rcmd",
        { params },
      );
      items = res.data?.data?.item ?? [];
    } catch {
      const res = await this.client.get(
        "/x/web-interface/index/top/feed/rcmd",
        {
          params: { ps, fresh_idx: freshIdx, fresh_idx_1h: freshIdx1h },
        },
      );
      items = res.data?.data?.item ?? [];
    }

    const videos = this.normalizeRecommendItems(items);
    return {
      videos,
      freshIdx: freshIdx + 1,
      hasMore: videos.length > 0,
    };
  }

  private normalizeRecommendItems(items: unknown[]): VideoItem[] {
    return items
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .filter((item) => item.bvid)
      .map((item) => this.normalizeVideo(item));
  }

  async getVideoBriefs(
    bvids: string[],
  ): Promise<
    Array<{ bvid: string; cover: string; upperName: string; duration: number }>
  > {
    await this.ensureBuvid3();
    const unique = [...new Set(bvids.filter(Boolean))];
    const results: Array<{
      bvid: string;
      cover: string;
      upperName: string;
      duration: number;
    }> = [];

    for (let index = 0; index < unique.length; index++) {
      const bvid = unique[index];
      try {
        const params = await signParams({ bvid });
        const res = await this.client.get("/x/web-interface/wbi/view", {
          params,
        });
        const view = res.data?.data as Record<string, unknown> | undefined;
        if (res.data?.code !== 0 || !view?.bvid) continue;

        results.push({
          bvid: view.bvid as string,
          cover: (view.pic as string) ?? "",
          upperName: ((view.owner as { name?: string })?.name ?? "") as string,
          duration: (view.duration as number) ?? 0,
        });
      } catch {
        try {
          const res = await this.client.get("/x/web-interface/view", {
            params: { bvid },
          });
          const view = res.data?.data as Record<string, unknown> | undefined;
          if (res.data?.code !== 0 || !view?.bvid) continue;
          results.push({
            bvid: view.bvid as string,
            cover: (view.pic as string) ?? "",
            upperName: ((view.owner as { name?: string })?.name ??
              "") as string,
            duration: (view.duration as number) ?? 0,
          });
        } catch {
          // skip failed item
        }
      }

      if (index % 5 === 4) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    return results;
  }

  async getVideo(bvid: string): Promise<VideoDetail> {
    await this.ensureBuvid3();
    const params = await signParams({ bvid });
    const viewRes = await this.client.get("/x/web-interface/wbi/view", {
      params,
    });

    if (viewRes.data?.code !== 0) {
      throw new Error(viewRes.data?.message || "视频信息获取失败");
    }

    const view = viewRes.data?.data;
    if (!view?.bvid) throw new Error("Video not found");

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
        face: view.owner.face,
      },
      pubdate: view.pubdate,
      desc: view.desc ?? "",
      pages: (view.pages ?? []).map((part: Record<string, unknown>) => ({
        cid: part.cid as number,
        page: part.page as number,
        part: (part.part as string) || `P${part.page}`,
        duration: (part.duration as number) ?? 0,
      })),
      stat: {
        view: view.stat?.view ?? 0,
        danmaku: view.stat?.danmaku ?? 0,
        reply: view.stat?.reply ?? 0,
        favorite: view.stat?.favorite ?? 0,
        coin: view.stat?.coin ?? 0,
        like: view.stat?.like ?? 0,
      },
    };
  }

  async getPlayUrl(bvid: string, cid: number, qn = 64): Promise<VideoPlayInfo> {
    await this.ensureBuvid3();

    const mp4Params = await signParams({
      bvid,
      cid,
      qn,
      fnval: 1,
      fnver: 0,
      fourk: 0,
    });

    const mp4Res = await this.client.get("/x/player/wbi/playurl", {
      params: mp4Params,
    });
    if (mp4Res.data?.code !== 0) {
      throw new Error(mp4Res.data?.message || "播放地址获取失败");
    }

    const mp4Data = mp4Res.data?.data;
    const mp4Stream = mp4Data?.durl?.[0] as
      | { url?: string; format?: string }
      | undefined;
    if (mp4Stream?.url) {
      return this.buildPlayInfoFromDurl(mp4Data, mp4Stream, qn);
    }

    const dashParams = await signParams({
      bvid,
      cid,
      qn,
      fnval: 16,
      fnver: 0,
      fourk: 0,
    });

    const dashRes = await this.client.get("/x/player/wbi/playurl", {
      params: dashParams,
    });
    if (dashRes.data?.code !== 0) {
      throw new Error(dashRes.data?.message || "播放地址获取失败");
    }

    const dashData = dashRes.data?.data;
    const dashPlay = this.buildPlayInfoFromDash(dashData, qn);
    if (!dashPlay) {
      throw new Error("该视频暂不支持在线播放，可能为付费或受限内容");
    }

    return dashPlay;
  }

  private buildPlayInfoFromDurl(
    data: Record<string, unknown>,
    stream: { url?: string; format?: string },
    requestedQn: number,
  ): VideoPlayInfo {
    const url = stream.url!;
    const streamFormat =
      (stream.format as string | undefined)?.toLowerCase() ?? "";
    const format: VideoPlayInfo["format"] =
      streamFormat.includes("flv") || url.includes(".flv") ? "flv" : "mp4";

    const acceptQuality = (data.accept_quality as number[] | undefined) ?? [
      (data.quality as number) ?? requestedQn,
    ];
    const acceptDescription =
      (data.accept_description as string[] | undefined) ??
      acceptQuality.map((value: number) => `${value}P`);

    const qualities = acceptQuality.map((value: number, index: number) => ({
      qn: value,
      label: acceptDescription[index] ?? `${value}P`,
    }));

    const quality = (data.quality as number) ?? requestedQn;
    const qualityIndex = acceptQuality.indexOf(quality);

    return {
      url,
      format,
      quality,
      qualityLabel: acceptDescription[qualityIndex] ?? `${quality}P`,
      qualities,
    };
  }

  private buildPlayInfoFromDash(
    data: Record<string, unknown>,
    requestedQn: number,
  ): VideoPlayInfo | null {
    const dash = data.dash as Record<string, unknown> | undefined;
    if (!dash) return null;

    type DashStream = {
      id: number;
      baseUrl?: string;
      base_url?: string;
      bandwidth: number;
      mimeType?: string;
      mime_type?: string;
      codecs: string;
      width?: number;
      height?: number;
      frameRate?: string;
      frame_rate?: string;
      codecid?: number;
      SegmentBase?: { Initialization?: string; indexRange?: string };
      segment_base?: { initialization?: string; index_range?: string };
    };

    const videos = ((dash.video as DashStream[] | undefined) ?? []).filter(
      (item) => item.codecid === 7 || item.codecs?.startsWith("avc1"),
    );
    if (videos.length === 0) return null;

    const pickByQn = (items: DashStream[], qn: number) => {
      const exact = items.find((item) => item.id === qn);
      if (exact) return exact;
      return [...items].sort(
        (a, b) => Math.abs(a.id - qn) - Math.abs(b.id - qn),
      )[0];
    };

    const video = pickByQn(videos, requestedQn);
    const audios = (dash.audio as DashStream[] | undefined) ?? [];
    const audio =
      audios.find((item) => item.id === 30280) ??
      audios.find((item) => item.id === 30232) ??
      audios[0];
    if (!audio) return null;

    const videoUrl = video.baseUrl ?? video.base_url;
    const audioUrl = audio.baseUrl ?? audio.base_url;
    const videoSeg = video.SegmentBase ?? video.segment_base;
    const audioSeg = audio.SegmentBase ?? audio.segment_base;
    if (!videoUrl || !audioUrl || !videoSeg || !audioSeg) return null;

    const videoInit = videoSeg.Initialization ?? videoSeg.initialization;
    const videoIndex = videoSeg.indexRange ?? videoSeg.index_range;
    const audioInit = audioSeg.Initialization ?? audioSeg.initialization;
    const audioIndex = audioSeg.indexRange ?? audioSeg.index_range;
    if (!videoInit || !videoIndex || !audioInit || !audioIndex) return null;

    const acceptQuality = (data.accept_quality as number[] | undefined) ?? [
      video.id,
    ];
    const acceptDescription =
      (data.accept_description as string[] | undefined) ??
      acceptQuality.map((value: number) => `${value}P`);

    const avcQnSet = new Set(videos.map((item) => item.id));
    const qualities = acceptQuality
      .filter((value) => avcQnSet.has(value))
      .map((value, index) => ({
        qn: value,
        label: acceptDescription[acceptQuality.indexOf(value)] ?? `${value}P`,
      }));

    if (qualities.length === 0) {
      qualities.push({ qn: video.id, label: `${video.id}P` });
    }

    const quality = video.id;
    const qualityIndex = acceptQuality.indexOf(quality);

    const dashPayload = {
      duration: (dash.duration as number) ?? 0,
      video: {
        id: video.id,
        baseUrl: videoUrl,
        bandwidth: video.bandwidth,
        mimeType: video.mimeType ?? video.mime_type ?? "video/mp4",
        codecs: video.codecs,
        width: video.width,
        height: video.height,
        frameRate: video.frameRate ?? video.frame_rate,
        segmentBase: {
          initialization: videoInit,
          indexRange: videoIndex,
        },
      },
      audio: {
        id: audio.id,
        baseUrl: audioUrl,
        bandwidth: audio.bandwidth,
        mimeType: audio.mimeType ?? audio.mime_type ?? "audio/mp4",
        codecs: audio.codecs,
        segmentBase: {
          initialization: audioInit,
          indexRange: audioIndex,
        },
      },
    };

    return {
      url: buildDashMpdUri(dashPayload),
      format: "dash",
      quality,
      qualityLabel: acceptDescription[qualityIndex] ?? `${quality}P`,
      qualities,
    };
  }

  private subscribedSeasonsCache: UserCollectionItem[] | null = null;

  private getDefaultFavFolderId(folders: FavFolder[]): number | null {
    if (folders.length === 0) return null;
    const preferred = folders.find(
      (folder) =>
        folder.title === "默认收藏夹" ||
        folder.title.toLowerCase() === "default",
    );
    return preferred?.id ?? folders[0].id;
  }

  private async fetchCollectedSeasonFolders(
    mid: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: UserCollectionItem[]; hasMore: boolean }> {
    await this.ensureBuvid3();

    const res = await this.client.get("/x/v3/fav/folder/collected/list", {
      params: {
        up_mid: mid,
        pn: page,
        ps: pageSize,
        platform: "web",
      },
      headers: { Referer: `https://space.bilibili.com/${mid}/favlist` },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      return { items: [], hasMore: false };
    }

    const list =
      (res.data?.data?.list as Record<string, unknown>[] | undefined) ?? [];
    const items = list
      .map((item) => this.normalizeCollectedFolderAsSeason(item))
      .filter((item): item is UserCollectionItem => item != null);

    return {
      items,
      hasMore: list.length >= pageSize,
    };
  }

  private async loadSubscribedSeasonsFromFolders(): Promise<
    UserCollectionItem[]
  > {
    if (this.subscribedSeasonsCache) return this.subscribedSeasonsCache;

    const folders = await this.getFavFolders();
    const defaultId = this.getDefaultFavFolderId(folders);
    const folderOrder = defaultId
      ? [
          ...folders.filter((folder) => folder.id === defaultId),
          ...folders.filter((folder) => folder.id !== defaultId),
        ]
      : folders;

    const seen = new Set<number>();
    const result: UserCollectionItem[] = [];

    for (const folder of folderOrder) {
      let page = 1;
      while (true) {
        const { medias, hasMore } = await this.fetchFavResourcePage(
          folder.id,
          page,
          40,
        );
        for (const media of medias) {
          const item = this.normalizeSubscribedSeason(media);
          if (!item || seen.has(item.id)) continue;
          seen.add(item.id);
          result.push(item);
        }
        if (!hasMore) break;
        page++;
      }
    }

    this.subscribedSeasonsCache = result;
    return result;
  }

  private normalizeCollectedFolderAsSeason(
    item: Record<string, unknown>,
  ): UserCollectionItem | null {
    const type = Number(item.type);
    const seasonId = Number(item.season_id ?? item.id);
    if (!seasonId) return null;

    // 普通收藏夹 type=11，视频合集在 collected/list 中会有不同标识
    if (type === 11 && !item.season_id) return null;

    const upper = item.upper as Record<string, unknown> | undefined;
    const cntInfo = item.cnt_info as Record<string, unknown> | undefined;

    return {
      id: seasonId,
      kind: "season",
      title: (item.title as string) ?? "未命名合集",
      cover: this.normalizeBfsUrl((item.cover as string) ?? ""),
      description: (item.intro as string) ?? "",
      total: (item.media_count as number) ?? (cntInfo?.collect as number) ?? 0,
      ownerMid: Number(upper?.mid) || undefined,
      source: "subscribed",
    };
  }

  private mapFavMedias(medias: unknown[]): FavResource[] {
    return medias.map((m) => {
      const media = m as Record<string, unknown>;
      return {
        id: media.id as number,
        bvid: (media.bvid as string) ?? "",
        title: media.title as string,
        cover: (media.cover as string) ?? "",
        upper: {
          mid: (media.upper as { mid: number })?.mid ?? 0,
          name: (media.upper as { name: string })?.name ?? "",
        },
        duration: (media.duration as number) ?? 0,
      };
    });
  }

  private async fetchFavResourcePage(
    mediaId: number,
    page: number,
    pageSize: number,
  ): Promise<{ medias: unknown[]; hasMore: boolean }> {
    await this.ensureBuvid3();

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await this.client.get("/x/v3/fav/resource/list", {
        params: {
          media_id: mediaId,
          pn: page,
          ps: pageSize,
          platform: "web",
          mobi_app: "web",
        },
        headers: { Referer: "https://www.bilibili.com/" },
        validateStatus: () => true,
      });

      const code = res.data?.code as number | undefined;
      if (res.status === 412 || code === -412) {
        if (attempt < 4) {
          await sleep(600 * attempt);
          continue;
        }
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
      }

      if (code !== 0) {
        throw new Error((res.data?.message as string) || "收藏列表获取失败");
      }

      const medias = res.data?.data?.medias ?? [];
      const hasMore = res.data?.data?.has_more ?? medias.length >= pageSize;
      return { medias, hasMore };
    }

    throw new Error("收藏列表获取失败，请稍后重试");
  }

  async getFavFolders(): Promise<FavFolder[]> {
    const mid =
      appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
    if (!mid) return [];

    await this.ensureBuvid3();

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await this.client.get("/x/v3/fav/folder/created/list-all", {
        params: { up_mid: mid },
        headers: { Referer: "https://www.bilibili.com/" },
        validateStatus: () => true,
      });

      if (res.status === 412 || res.data?.code === -412) {
        if (attempt < 3) {
          await sleep(600 * attempt);
          continue;
        }
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
      }

      if (res.data?.code !== 0) {
        throw new Error((res.data?.message as string) || "收藏夹列表获取失败");
      }

      const list = res.data?.data?.list ?? [];
      return list.map((f: Record<string, unknown>) => ({
        id: f.id as number,
        fid: f.fid as number,
        title: f.title as string,
        mediaCount: (f.media_count as number) ?? 0,
        cover: (f.cover as string) ?? "",
      }));
    }

    return [];
  }

  async getVideoFavFolders(aid: number): Promise<VideoFavFolder[]> {
    const mid =
      appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
    if (!mid) return [];

    await this.ensureBuvid3();

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await this.client.get("/x/v3/fav/folder/created/list-all", {
        params: { up_mid: mid, type: 2, rid: aid },
        headers: { Referer: "https://www.bilibili.com/" },
        validateStatus: () => true,
      });

      if (res.status === 412 || res.data?.code === -412) {
        if (attempt < 3) {
          await sleep(600 * attempt);
          continue;
        }
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
      }

      if (res.data?.code !== 0) {
        throw new Error((res.data?.message as string) || "收藏夹列表获取失败");
      }

      const list = res.data?.data?.list ?? [];
      return list.map((f: Record<string, unknown>) => ({
        id: f.id as number,
        fid: f.fid as number,
        title: f.title as string,
        mediaCount: (f.media_count as number) ?? 0,
        cover: (f.cover as string) ?? "",
        collected: (f.fav_state as number) === 1,
        isDefault:
          (f.title as string) === "默认收藏夹" ||
          (f.title as string).toLowerCase() === "default",
      }));
    }

    return [];
  }

  async setVideoFavFolders(
    aid: number,
    addMediaIds: number[],
    delMediaIds: number[],
  ): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再收藏");

    if (addMediaIds.length === 0 && delMediaIds.length === 0) return;

    const body: Record<string, string> = {
      rid: String(aid),
      type: "2",
      csrf,
    };
    if (addMediaIds.length > 0) body.add_media_ids = addMediaIds.join(",");
    if (delMediaIds.length > 0) body.del_media_ids = delMediaIds.join(",");

    const res = await this.client.post(
      "/x/v3/fav/resource/deal",
      new URLSearchParams(body),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://www.bilibili.com/",
        },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "收藏操作失败");
    }
  }

  async getFavResources(
    mediaId: number,
    page = 1,
    pageSize = 20,
  ): Promise<{
    resources: FavResource[];
    page: number;
    hasMore: boolean;
  }> {
    const { medias, hasMore } = await this.fetchFavResourcePage(
      mediaId,
      page,
      pageSize,
    );
    return {
      resources: this.mapFavMedias(medias),
      page,
      hasMore,
    };
  }

  async getAllFavResourcesInFolder(
    mediaId: number,
    onPage?: (fetchedCount: number) => void | Promise<void>,
  ): Promise<FavResource[]> {
    const pageSize = 40;
    const all: FavResource[] = [];
    let page = 1;

    while (true) {
      const { medias, hasMore } = await this.fetchFavResourcePage(
        mediaId,
        page,
        pageSize,
      );
      if (medias.length === 0) break;

      all.push(...this.mapFavMedias(medias));
      await onPage?.(all.length);

      if (!hasMore) break;
      page++;
      await sleep(350);
    }

    return all;
  }

  async getAllFavResources(): Promise<FavResource[]> {
    const folders = await this.getFavFolders();
    const seen = new Set<number>();
    const all: FavResource[] = [];

    for (const folder of folders) {
      const items = await this.getAllFavResourcesInFolder(folder.id);
      for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        all.push(item);
      }
    }

    return all;
  }

  async getFollowings(page = 1): Promise<FollowingUp[]> {
    const mid = appStore.get("user")?.mid;
    if (!mid) return [];

    const res = await this.client.get("/x/relation/followings", {
      params: { vmid: mid, pn: page, ps: 50, order: "desc" },
    });

    const list = res.data?.data?.list ?? [];
    return list.map((u: Record<string, unknown>) => this.mapFollowingUser(u));
  }

  async getAllFollowings(): Promise<FollowingUp[]> {
    const all: FollowingUp[] = [];
    let page = 1;

    while (true) {
      const batch = await this.getFollowings(page);
      if (batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 50) break;
      page++;
    }

    return all;
  }

  async getFollowTags(): Promise<FollowTag[]> {
    if (!isLoggedIn()) return [];

    await this.ensureBuvid3();

    const res = await this.client.get("/x/relation/tags", {
      headers: { Referer: "https://space.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "关注分组列表获取失败");
    }

    const list = res.data?.data ?? [];
    return list.map((tag: Record<string, unknown>) => ({
      tagId: tag.tagid as number,
      name: tag.name as string,
      count: (tag.count as number) ?? 0,
    }));
  }

  async getFollowingsInTag(
    tagId: number,
    page = 1,
    pageSize = 50,
  ): Promise<FollowingsPage> {
    if (!isLoggedIn()) {
      return { followings: [], page: 1, hasMore: false };
    }

    await this.ensureBuvid3();

    const res = await this.client.get("/x/relation/tag", {
      params: { tagid: tagId, pn: page, ps: pageSize },
      headers: { Referer: "https://space.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "关注分组成员获取失败");
    }

    const list = res.data?.data ?? [];
    const followings = list.map((u: Record<string, unknown>) =>
      this.mapFollowingUser(u),
    );

    return {
      followings,
      page,
      hasMore: followings.length >= pageSize,
    };
  }

  private mapFollowingUser(u: Record<string, unknown>): FollowingUp {
    const official = u.official as
      | { role?: number; title?: string }
      | undefined;
    const officialVerify = u.official_verify as
      | { type?: number; desc?: string }
      | undefined;
    const attribute = (u.attribute as number) ?? 0;

    return {
      mid: u.mid as number,
      uname: u.uname as string,
      face: u.face as string,
      sign: (u.sign as string) ?? "",
      official: {
        role: official?.role ?? officialVerify?.type ?? 0,
        title: official?.title ?? officialVerify?.desc ?? "",
      },
      special: (u.special as number) === 1,
      mutual: attribute === 6,
    };
  }

  private async postRelationForm(
    path: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再操作");

    const res = await this.client.post(
      path,
      new URLSearchParams({ ...fields, csrf }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://space.bilibili.com/",
          Origin: "https://space.bilibili.com",
        },
        validateStatus: () => true,
      },
    );

    if (res.status === 404) {
      throw new Error("B站接口不存在，请更新客户端");
    }

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "操作失败");
    }
  }

  async getUserFollowTags(mid: number): Promise<number[]> {
    if (!isLoggedIn()) return [];

    await this.ensureBuvid3();

    const res = await this.client.get("/x/relation/tag/user", {
      params: { fid: mid },
      headers: { Referer: "https://space.bilibili.com/" },
    });

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "获取分组失败");
    }

    const data = (res.data?.data as Record<string, string>) ?? {};
    return Object.keys(data).map((key) => Number(key));
  }

  async setUserFollowTags(mid: number, tagIds: number[]): Promise<void> {
    if (!isLoggedIn()) throw new Error("请先登录后再操作");

    const current = await this.getUserFollowTags(mid);
    const nextSet = new Set(tagIds);
    const toAdd = tagIds.filter((id) => id !== 0 && !current.includes(id));
    const toRemove = current.filter((id) => !nextSet.has(id) && id !== 0);

    for (const tagId of toRemove) {
      await this.postRelationForm("/x/relation/tags/moveUsers", {
        beforeTagids: String(tagId),
        afterTagids: "0",
        fids: String(mid),
      });
    }

    if (toAdd.length > 0) {
      await this.postRelationForm("/x/relation/tags/addUsers", {
        fids: String(mid),
        tagids: toAdd.join(","),
      });
    }
  }

  async getUpProfile(mid: number): Promise<UpProfile> {
    await this.ensureBuvid3();

    const accParams = await signParams({ mid });
    const [cardRes, statRes, accRes] = await Promise.all([
      this.client.get("/x/web-interface/card", {
        params: { mid, photo: true },
      }),
      this.client.get("/x/relation/stat", { params: { vmid: mid } }),
      this.client
        .get("/x/space/wbi/acc/info", {
          params: accParams,
          headers: { Referer: `https://space.bilibili.com/${mid}` },
          validateStatus: () => true,
        })
        .catch(() => null),
    ]);

    if (cardRes.data?.code !== 0) {
      throw new Error(cardRes.data?.message || "UP 主信息获取失败");
    }

    const payload = cardRes.data?.data as Record<string, unknown> | undefined;
    const card = payload?.card as Record<string, unknown> | undefined;
    const stat = statRes.data?.data as Record<string, unknown> | undefined;
    const accData =
      accRes && (accRes as AxiosResponse).data?.code === 0
        ? ((accRes as AxiosResponse).data?.data as Record<string, unknown>)
        : undefined;

    return {
      mid,
      name: (card?.name as string) ?? "",
      face: (card?.face as string) ?? "",
      sign: (card?.sign as string) ?? "",
      fans:
        (stat?.follower as number) ??
        (payload?.follower as number) ??
        (card?.fans as number) ??
        0,
      following: (stat?.following as number) ?? 0,
      videos: (payload?.archive_count as number) ?? 0,
      topPhoto: this.normalizeBfsUrl((accData?.top_photo as string) ?? ""),
    };
  }

  async getUpRelation(mid: number): Promise<UpRelation> {
    if (!isLoggedIn()) {
      return { isFollowing: false, attribute: 0 };
    }

    const res = await this.client.get("/x/relation", { params: { fid: mid } });
    if (res.data?.code !== 0) {
      return { isFollowing: false, attribute: 0 };
    }

    const attribute = (res.data?.data?.attribute as number) ?? 0;
    return {
      isFollowing: attribute === 1 || attribute === 2 || attribute === 6,
      attribute,
    };
  }

  async modifyFollow(mid: number, follow: boolean): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再关注");

    const res = await this.client.post(
      "/x/relation/modify",
      new URLSearchParams({
        fid: String(mid),
        act: follow ? "1" : "2",
        re_src: "11",
        csrf,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    if (res.data?.code !== 0) {
      throw new Error(res.data?.message || "关注操作失败");
    }
  }

  async getRecentVideoTitles(mid: number, limit = 5): Promise<string[]> {
    const page = await this.getUpVideos(mid, 1);
    return page.videos.slice(0, limit).map((video) => video.title);
  }

  async getUpVideos(mid: number, page = 1): Promise<UpVideosPage> {
    await this.ensureBuvid3();

    if (!isLoggedIn()) {
      throw new Error("请先登录后查看 UP 主投稿");
    }

    const currentUser = this.getAuthStatus();
    if (currentUser.isLogin && currentUser.mid === mid) {
      try {
        return await this.fetchMyArchives(page);
      } catch {
        // fall back to public list
      }
    }

    try {
      return await this.fetchSpaceArcList(mid, page);
    } catch (primaryError) {
      try {
        const profile = await this.getUpProfile(mid);
        const fallback = await this.fetchUpVideosBySearch(
          mid,
          profile.name,
          page,
        );
        if (fallback.videos.length > 0) return fallback;
      } catch {
        // use primary error below
      }

      throw primaryError instanceof Error
        ? primaryError
        : new Error("投稿列表获取失败，请稍后重试");
    }
  }

  async searchVideos(
    keyword: string,
    page = 1,
    order: SearchOrder = "totalrank",
  ): Promise<SearchVideosPage> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { videos: [], page: 1, hasMore: false, total: 0 };
    }

    await this.ensureBuvid3();

    const pageSize = 20;
    const params = await signParams({
      search_type: "video",
      keyword: trimmed,
      page,
      page_size: pageSize,
      order,
      platform: "pc",
      single_column: 0,
      source: "",
    });

    const res = await this.client.get("/x/web-interface/wbi/search/type", {
      params,
      headers: { Referer: "https://search.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "搜索失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const results = (
      (data?.result as Record<string, unknown>[] | undefined) ?? []
    ).filter((item) => item.bvid);
    const total = (data?.numResults as number) ?? results.length;
    const videos = results.map((item) => this.normalizeSearchVideo(item));

    return {
      videos,
      page,
      hasMore: page * pageSize < total,
      total,
    };
  }

  private async fetchSpaceArcList(
    mid: number,
    page: number,
  ): Promise<UpVideosPage> {
    const referer = "https://www.bilibili.com/";

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await this.client.get("/x/space/arc/search", {
        params: {
          mid,
          pn: page,
          ps: 30,
          tid: 0,
          keyword: "",
          order: "pubdate",
        },
        headers: { Referer: referer },
        validateStatus: () => true,
      });

      const payload = res.data;
      const code = payload?.code as number | undefined;
      if (code === 0) {
        const vlist = (payload?.data?.list?.vlist ?? []) as Record<
          string,
          unknown
        >[];
        const pageInfo = payload?.data?.page as
          | { count?: number; pn?: number; ps?: number }
          | undefined;
        const total = pageInfo?.count ?? vlist.length;
        const pageSize = pageInfo?.ps ?? 30;
        return {
          videos: vlist.map((item) => this.normalizeSpaceVideo(item, mid)),
          page,
          total,
          hasMore: page * pageSize < total,
        };
      }

      if ((code === -799 || code === -412) && attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }

      if (code === -799) {
        throw new Error("请求过于频繁，请稍后再试");
      }
      throw new Error("投稿列表获取失败，请稍后重试");
    }

    throw new Error("投稿列表获取失败，请稍后重试");
  }

  private async fetchMyArchives(page: number): Promise<UpVideosPage> {
    const pageSize = 30;
    const res = await this.memberClient.get("/x/web/archives", {
      params: {
        status: "is_pubing,pubed,not_pubed",
        pn: page,
        ps: pageSize,
        coop: 1,
        interactive: 1,
      },
      headers: {
        Referer: "https://member.bilibili.com/platform/upload-manager/article",
      },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "我的投稿列表获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const arcAudits = (data?.arc_audits ?? []) as Record<string, unknown>[];
    const pageInfo = data?.page as
      | { pn?: number; ps?: number; count?: number }
      | undefined;
    const total = pageInfo?.count ?? arcAudits.length;
    const user = this.getAuthStatus();

    const videos = arcAudits
      .map((item) => {
        const archive = item.Archive as Record<string, unknown> | undefined;
        if (!archive?.bvid) return null;
        return this.normalizeArchiveAudit(item, user.mid, user.name);
      })
      .filter((item): item is VideoItem => item != null);

    return {
      videos,
      page,
      total,
      hasMore: page * pageSize < total,
    };
  }

  private normalizeBfsUrl(path: string): string {
    if (!path) return "";
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("http://")) return path.replace(/^http:/, "https:");
    if (path.startsWith("https://")) return path;
    if (path.startsWith("/")) return `https://i0.hdslb.com${path}`;
    return path;
  }

  private normalizeVideoCoverUrl(url: string): string {
    const base = this.normalizeBfsUrl(url);
    if (!base) return "";
    if (base.includes("@")) return base;
    return `${base}@672w_378h_1c.webp`;
  }

  private normalizeArchiveAudit(
    item: Record<string, unknown>,
    mid: number,
    name: string,
  ): VideoItem {
    const archive = item.Archive as Record<string, unknown>;
    const stat = item.stat as Record<string, unknown> | undefined;
    const parts = item.Videos as Record<string, unknown>[] | null | undefined;

    let duration = (archive.duration as number) ?? 0;
    if (!duration && parts?.length) {
      duration = parts.reduce(
        (sum, part) => sum + ((part.duration as number) ?? 0),
        0,
      );
    }

    return {
      bvid: archive.bvid as string,
      aid: (archive.aid as number) ?? 0,
      title: archive.title as string,
      cover: this.normalizeVideoCoverUrl((archive.cover as string) ?? ""),
      duration,
      play: (stat?.view as number) ?? 0,
      danmaku: (stat?.danmaku as number) ?? 0,
      owner: { mid, name, face: "" },
      pubdate: (archive.ptime as number) ?? (archive.ctime as number) ?? 0,
    };
  }

  private async fetchUpVideosBySearch(
    mid: number,
    upName: string,
    page: number,
  ): Promise<UpVideosPage> {
    if (!upName.trim()) {
      return { videos: [], page, hasMore: false, total: 0 };
    }

    const params = await signParams({
      search_type: "video",
      keyword: upName,
      page,
      page_size: 30,
      order: "pubdate",
      platform: "pc",
      single_column: 0,
      source: "",
    });

    const res = await this.client.get("/x/web-interface/wbi/search/type", {
      params,
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      return { videos: [], page, hasMore: false, total: 0 };
    }

    const results = (res.data?.data?.result ?? []) as Record<string, unknown>[];
    const videos = results
      .filter((item) => item.mid === mid)
      .map((item) => this.normalizeSearchVideo(item));

    return {
      videos,
      page,
      total: videos.length,
      hasMore: videos.length >= 30,
    };
  }

  logout(): void {
    appStore.set("cookies", {
      SESSDATA: "",
      bili_jct: "",
      DedeUserID: "",
      DedeUserID__ckMd5: "",
      buvid3: appStore.get("cookies").buvid3 ?? "",
    });
    appStore.set("user", null);
    appStore.set("refreshToken", "");
  }

  getAuthStatus(): UserInfo {
    const user = appStore.get("user");
    if (user?.isLogin) return user;
    return { mid: 0, name: "未登录", face: "", isLogin: false };
  }

  private normalizeVideo(item: Record<string, unknown>): VideoItem {
    const owner = item.owner as Record<string, unknown> | undefined;
    return {
      bvid: item.bvid as string,
      aid: (item.id as number) ?? 0,
      title: item.title as string,
      cover: this.normalizeVideoCoverUrl((item.pic as string) ?? ""),
      duration: (item.duration as number) ?? 0,
      play: (item.stat as { view?: number })?.view ?? 0,
      danmaku: (item.stat as { danmaku?: number })?.danmaku ?? 0,
      owner: {
        mid: (owner?.mid as number) ?? 0,
        name: (owner?.name as string) ?? "",
        face: (owner?.face as string) ?? "",
      },
      pubdate:
        (item.pubdate as number) ??
        (item.pub_time as number) ??
        (item.ctime as number) ??
        (item.created as number) ??
        0,
    };
  }

  private normalizeSpaceVideo(
    item: Record<string, unknown>,
    mid: number,
  ): VideoItem {
    return {
      bvid: item.bvid as string,
      aid: (item.aid as number) ?? 0,
      title: item.title as string,
      cover: this.normalizeVideoCoverUrl((item.pic as string) ?? ""),
      duration: (item.length as number) ?? 0,
      play: (item.play as number) ?? 0,
      danmaku: (item.video_review as number) ?? 0,
      owner: {
        mid,
        name: (item.author as string) ?? "",
        face: "",
      },
      pubdate: (item.created as number) ?? 0,
    };
  }

  async getToViewList(): Promise<ToViewList> {
    if (!isLoggedIn()) return { videos: [], count: 0 };

    await this.ensureBuvid3();

    const res = await this.client.get("/x/v2/history/toview", {
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "稍后再看列表获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const list = (data?.list as Record<string, unknown>[] | undefined) ?? [];
    const videos = list
      .filter((item) => item.bvid)
      .map((item) => this.normalizeToViewItem(item));

    return {
      videos,
      count: (data?.count as number) ?? videos.length,
    };
  }

  async addToView(aid: number, bvid: string): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再添加稍后再看");

    const body = new URLSearchParams({
      csrf,
      aid: String(aid),
      bvid,
    });

    const res = await this.client.post("/x/v2/history/toview/add", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.bilibili.com/",
      },
      validateStatus: () => true,
    });

    this.assertToViewMutationResponse(res, "添加稍后再看失败");
  }

  async removeFromToView(aid: number): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录");

    const body = new URLSearchParams({
      csrf,
      aid: String(aid),
    });

    const res = await this.client.post("/x/v2/history/toview/del", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.bilibili.com/",
      },
      validateStatus: () => true,
    });

    this.assertToViewMutationResponse(res, "移除稍后再看失败");
  }

  private assertToViewMutationResponse(
    res: AxiosResponse,
    fallback: string,
  ): void {
    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }

    const code = res.data?.code as number | undefined;
    if (code === 90001) {
      throw new Error("稍后再看列表已满（最多 100 个）");
    }
    if (code === 0) return;

    throw new Error((res.data?.message as string) || fallback);
  }

  async getSpaceDynamics(mid: number, offset = ""): Promise<SpaceDynamicPage> {
    await this.ensureBuvid3();

    const params: Record<string, string | number> = {
      host_mid: mid,
      timezone_offset: -480,
      platform: "web",
      features:
        "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,forwardListHidden,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard",
    };
    if (offset) params.offset = offset;

    const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/space", {
      params,
      headers: { Referer: `https://space.bilibili.com/${mid}/dynamic` },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "动态获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawItems =
      (data?.items as Record<string, unknown>[] | undefined) ?? [];
    const items = rawItems
      .map((item) => this.normalizeSpaceDynamicItem(item))
      .filter((item): item is SpaceDynamicItem => item != null);

    return {
      items,
      offset: (data?.offset as string) ?? "",
      hasMore: Boolean(data?.has_more),
    };
  }

  async getUserCollections(
    mid: number,
    page = 1,
  ): Promise<UserCollectionsPage> {
    await this.ensureBuvid3();

    const params = await signParams({
      mid,
      page_num: page,
      page_size: 20,
      web_location: "333.999",
    });

    const res = await this.client.get(
      "/x/polymer/web-space/seasons_series_list",
      {
        params,
        headers: { Referer: `https://space.bilibili.com/${mid}/lists` },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "合集列表获取失败");
    }

    let itemsLists = (res.data?.data as Record<string, unknown> | undefined)
      ?.items_lists as Record<string, unknown> | undefined;

    let seasons = this.parseCollectionList(
      itemsLists?.seasons_list,
      "season",
      "created",
    );
    let series = this.parseCollectionList(
      itemsLists?.series_list,
      "series",
      "created",
    );

    if (seasons.length === 0 && series.length === 0 && page === 1) {
      const fallback = await this.client.get(
        "/x/polymer/web-space/home/seasons_series",
        {
          params: await signParams({ mid, web_location: "333.999" }),
          headers: { Referer: `https://space.bilibili.com/${mid}` },
          validateStatus: () => true,
        },
      );
      if (fallback.data?.code === 0) {
        const homeData = fallback.data?.data as Record<string, unknown>;
        itemsLists = homeData?.items_lists as
          | Record<string, unknown>
          | undefined;
        seasons = this.parseCollectionList(
          itemsLists?.seasons_list ?? homeData?.seasons_list,
          "season",
          "created",
        );
        series = this.parseCollectionList(
          itemsLists?.series_list ?? homeData?.series_list,
          "series",
          "created",
        );
      }
    }

    const pageInfo = itemsLists?.page as Record<string, unknown> | undefined;
    const total = (pageInfo?.total as number) ?? seasons.length + series.length;
    const pageSize = (pageInfo?.page_size as number) ?? 20;

    return {
      seasons,
      series,
      page,
      hasMore: page * pageSize < total,
    };
  }

  async getSubscribedCollections(page = 1): Promise<UserCollectionsPage> {
    const mid =
      appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
    if (!mid) {
      return { seasons: [], series: [], page, hasMore: false };
    }

    const pageSize = 20;

    try {
      const collected = await this.fetchCollectedSeasonFolders(
        mid,
        page,
        pageSize,
      );
      if (collected.items.length > 0) {
        return {
          seasons: collected.items,
          series: [],
          page,
          hasMore: collected.hasMore,
        };
      }
    } catch {
      // 继续走文件夹扫描兜底
    }

    const all = await this.loadSubscribedSeasonsFromFolders();
    const start = (page - 1) * pageSize;
    const slice = all.slice(start, start + pageSize);

    return {
      seasons: slice,
      series: [],
      page,
      hasMore: start + pageSize < all.length,
    };
  }

  async getFavVideoMedias(page = 1): Promise<FavMediasPage> {
    const folders = await this.getFavFolders();
    const mediaId = this.getDefaultFavFolderId(folders);
    if (!mediaId) {
      return { items: [], page, hasMore: false };
    }

    const pageSize = 20;
    const { resources, hasMore } = await this.getFavResources(
      mediaId,
      page,
      pageSize,
    );

    const items: FavMediaItem[] = resources.map((resource) => ({
      id: resource.id,
      type: 2,
      title: resource.title,
      cover: resource.cover,
      intro: "",
      link: resource.bvid
        ? `https://www.bilibili.com/video/${resource.bvid}`
        : "",
      bvid: resource.bvid,
      upper: resource.upper,
      duration: resource.duration,
      playCount: 0,
      favTime: 0,
    }));

    return { items, page, hasMore };
  }

  async getOpusFavorites(page = 1): Promise<OpusFavPage> {
    await this.ensureBuvid3();

    const res = await this.client.get(
      "/x/polymer/web-dynamic/v1/opus/feed/fav",
      {
        params: { page, page_size: 20 },
        headers: { Referer: "https://www.bilibili.com/" },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "图文收藏获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawItems =
      (data?.items as Record<string, unknown>[] | undefined) ??
      (data?.list as Record<string, unknown>[] | undefined) ??
      [];

    const items = rawItems
      .map((item) => this.normalizeOpusFavItem(item))
      .filter((item): item is OpusFavItem => item != null);

    return {
      items,
      page,
      hasMore: Boolean(data?.has_more ?? items.length >= 20),
    };
  }

  async getCheeseFollowList(page = 1): Promise<CheeseCoursePage> {
    await this.ensureBuvid3();
    const pageSize = 20;

    const endpoints = [
      {
        url: "/pugv/view/web/purchased/list",
        params: { pn: page, ps: pageSize },
      },
      {
        url: "/pugv/app/web/season/follow/list",
        params: { pn: page, ps: pageSize },
      },
      {
        url: "/pugv/app/web/season/listfollow",
        params: { pn: page, ps: pageSize },
      },
    ];

    for (const { url, params } of endpoints) {
      const res = await this.client.get(url, {
        params,
        headers: { Referer: "https://www.bilibili.com/" },
        validateStatus: () => true,
      });
      if (res.data?.code !== 0) continue;

      const data = res.data?.data as Record<string, unknown> | undefined;
      const rawList =
        (data?.list as unknown[] | undefined) ??
        (data?.items as unknown[] | undefined) ??
        [];
      if (!Array.isArray(rawList) || rawList.length === 0) continue;

      const list = rawList
        .map((item) => this.normalizeCheeseCourseItem(item))
        .filter((item): item is CheeseCourseItem => item != null);

      const pageInfo = data?.page as Record<string, unknown> | undefined;
      const total =
        (pageInfo?.total as number) ?? (data?.total as number) ?? list.length;

      return {
        list,
        page,
        hasMore: page * pageSize < total,
        total,
      };
    }

    return { list: [], page, hasMore: false, total: 0 };
  }

  async getSeasonArchives(
    mid: number,
    seasonId: number,
    page = 1,
  ): Promise<UpVideosPage> {
    await this.ensureBuvid3();

    const params = await signParams({
      mid,
      season_id: seasonId,
      page_num: page,
      page_size: 30,
    });

    const res = await this.client.get(
      "/x/polymer/web-space/seasons_archives_list",
      {
        params,
        headers: { Referer: `https://space.bilibili.com/${mid}/lists` },
        validateStatus: () => true,
      },
    );

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "合集视频获取失败");
    }

    return this.normalizeArchivesPage(res.data?.data, mid, page);
  }

  async getSeriesArchives(seriesId: number, page = 1): Promise<UpVideosPage> {
    await this.ensureBuvid3();

    const res = await this.client.get("/x/series/archives", {
      params: { series_id: seriesId, page_num: page, page_size: 30 },
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "系列视频获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const meta = data?.meta as Record<string, unknown> | undefined;
    const mid = (meta?.mid as number) ?? 0;
    return this.normalizeArchivesPage(data, mid, page);
  }

  async getBangumiFollowList(
    mid: number,
    type: 1 | 2 = 1,
    page = 1,
  ): Promise<BangumiFollowPage> {
    await this.ensureBuvid3();

    const res = await this.client.get("/x/space/bangumi/follow/list", {
      params: {
        vmid: mid,
        type,
        follow_status: 0,
        pn: page,
        ps: 20,
      },
      headers: {
        Referer: `https://space.bilibili.com/${mid}/${type === 1 ? "bangumi" : "cinema"}`,
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "追番列表获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const list = (
      (data?.list as Record<string, unknown>[] | undefined) ?? []
    ).map((item) => this.normalizeBangumiItem(item));

    const total = (data?.total as number) ?? list.length;
    const pageSize = 20;

    return {
      list,
      page,
      hasMore: page * pageSize < total,
      total,
    };
  }

  private normalizeArchivesPage(
    data: unknown,
    mid: number,
    page: number,
  ): UpVideosPage {
    const payload = data as Record<string, unknown> | undefined;
    const archives =
      (payload?.archives as Record<string, unknown>[] | undefined) ?? [];
    const pageInfo = payload?.page as Record<string, unknown> | undefined;
    const total = (pageInfo?.total as number) ?? archives.length;
    const pageSize = (pageInfo?.page_size as number) ?? 30;

    const videos = archives
      .filter((item) => item.bvid)
      .map((item) => this.normalizeArchiveVideo(item, mid));

    return {
      videos,
      page,
      hasMore: page * pageSize < total,
      total,
    };
  }

  private normalizeArchiveVideo(
    item: Record<string, unknown>,
    mid: number,
  ): VideoItem {
    const stat = item.stat as Record<string, unknown> | undefined;
    return {
      bvid: item.bvid as string,
      aid: Number(item.aid) || 0,
      title: (item.title as string) ?? "",
      cover: this.normalizeVideoCoverUrl((item.pic as string) ?? ""),
      duration: (item.duration as number) ?? 0,
      play: (stat?.view as number) ?? 0,
      danmaku: (stat?.danmaku as number) ?? 0,
      owner: {
        mid,
        name: "",
        face: "",
      },
      pubdate:
        (item.pubdate as number) ??
        (item.ptime as number) ??
        (item.ctime as number) ??
        (item.created as number) ??
        0,
    };
  }

  private parseCollectionList(
    raw: unknown,
    kind: "season" | "series",
    source: "created" | "subscribed",
  ): UserCollectionItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => this.normalizeCollectionItem(item, kind, source))
      .filter((item): item is UserCollectionItem => item != null);
  }

  private normalizeCollectionItem(
    item: Record<string, unknown>,
    kind: "season" | "series",
    source: "created" | "subscribed" = "created",
  ): UserCollectionItem | null {
    const meta =
      (item.meta as Record<string, unknown> | undefined) ??
      (item as Record<string, unknown>);

    const id =
      kind === "season"
        ? Number(meta.season_id ?? item.season_id)
        : Number(meta.series_id ?? meta.seriesId ?? item.series_id);
    if (!id) return null;

    const upper = meta.upper as Record<string, unknown> | undefined;
    const cntInfo = meta.cnt_info as Record<string, unknown> | undefined;

    return {
      id,
      kind,
      title: (meta.name as string) ?? (meta.title as string) ?? "未命名",
      cover: this.normalizeBfsUrl(
        (meta.cover as string) ?? (meta.covr as string) ?? "",
      ),
      description: (meta.description as string) ?? (meta.intro as string) ?? "",
      total:
        (meta.total as number) ??
        (meta.archives_count as number) ??
        (meta.media_count as number) ??
        (cntInfo?.collect as number) ??
        0,
      ownerMid: Number(meta.mid ?? upper?.mid) || undefined,
      source,
    };
  }

  private normalizeSubscribedSeason(item: unknown): UserCollectionItem | null {
    const media = item as Record<string, unknown>;
    if (Number(media.type) !== 21) return null;

    const upper = media.upper as Record<string, unknown> | undefined;
    const cntInfo = media.cnt_info as Record<string, unknown> | undefined;

    return {
      id: Number(media.id) || 0,
      kind: "season",
      title: (media.title as string) ?? "未命名合集",
      cover: this.normalizeBfsUrl((media.cover as string) ?? ""),
      description: (media.intro as string) ?? "",
      total: (media.page as number) ?? (cntInfo?.collect as number) ?? 0,
      ownerMid: Number(upper?.mid) || undefined,
      source: "subscribed",
    };
  }

  private normalizeFavMediaItem(item: unknown): FavMediaItem | null {
    const media = item as Record<string, unknown>;
    const id = Number(media.id);
    if (!id) return null;

    const upper = media.upper as Record<string, unknown> | undefined;
    const cntInfo = media.cnt_info as Record<string, unknown> | undefined;
    const link = (media.link as string) ?? "";

    return {
      id,
      type: Number(media.type) || 0,
      title: (media.title as string) ?? "",
      cover: this.normalizeBfsUrl((media.cover as string) ?? ""),
      intro: (media.intro as string) ?? "",
      link,
      bvid: (media.bvid as string) ?? (media.bv_id as string) ?? "",
      upper: {
        mid: Number(upper?.mid) || 0,
        name: (upper?.name as string) ?? "",
      },
      duration: Number(media.duration) || 0,
      playCount: Number(cntInfo?.play) || 0,
      favTime: Number(media.fav_time) || 0,
    };
  }

  private normalizeOpusFavItem(
    item: Record<string, unknown>,
  ): OpusFavItem | null {
    const opusId =
      (item.opus_id as string) ??
      (item.id_str as string) ??
      String(item.id ?? "");
    if (!opusId) return null;

    const coverObj = item.cover as Record<string, unknown> | undefined;
    const coverPic = item.cover_pic as Record<string, unknown> | undefined;
    const textParagraph = item.text_paragraph as
      | Record<string, unknown>
      | undefined;
    const author = item.author as Record<string, unknown> | undefined;
    const moduleAuthor = item.module_author as
      | Record<string, unknown>
      | undefined;

    const jumpUrl =
      (item.jump_url as string) ??
      (item.card_uri as string) ??
      `https://www.bilibili.com/opus/${opusId}`;

    const summary =
      this.extractRichText(textParagraph) ||
      this.extractRichText(item.summary) ||
      this.extractRichText(item.content) ||
      "";

    return {
      id: opusId,
      title: (item.title as string) ?? (summary.slice(0, 40) || "图文动态"),
      cover: this.normalizeBfsUrl(
        (coverObj?.url as string) ??
          (coverPic?.url as string) ??
          (item.cover as string) ??
          "",
      ),
      summary,
      url: jumpUrl.startsWith("http")
        ? jumpUrl
        : `https:${jumpUrl.replace(/^\/\//, "//")}`,
      author: (author?.name as string) ?? (moduleAuthor?.name as string) ?? "",
    };
  }

  private normalizeCheeseCourseItem(item: unknown): CheeseCourseItem | null {
    const raw = item as Record<string, unknown>;
    const seasonId = Number(raw.season_id ?? raw.id);
    if (!seasonId) return null;

    const link = (raw.link as string) ?? "";
    const url = link.startsWith("http")
      ? link
      : `https://www.bilibili.com/cheese/play/ss${seasonId}`;

    return {
      seasonId,
      title: (raw.title as string) ?? "未命名课程",
      cover: this.normalizeBfsUrl((raw.cover as string) ?? ""),
      subtitle: (raw.subtitle as string) ?? "",
      epCount: Number(raw.ep_count ?? raw.episode_count) || 0,
      playCount: Number(raw.play ?? raw.view) || 0,
      status: (raw.status as string) ?? "",
      url,
    };
  }

  private normalizeBangumiItem(
    item: Record<string, unknown>,
  ): BangumiFollowItem {
    const newEp = item.new_ep as Record<string, unknown> | undefined;
    const seasonId = Number(item.season_id) || 0;
    const epId = Number(newEp?.id) || 0;
    const url = epId
      ? `https://www.bilibili.com/bangumi/play/ep${epId}`
      : `https://www.bilibili.com/bangumi/play/ss${seasonId}`;

    return {
      seasonId,
      title: (item.title as string) ?? "",
      cover: ((item.cover as string) ?? "").replace(/^http:/, "https:"),
      evaluate: (item.evaluate as string) ?? "",
      progress: (newEp?.index_show as string) ?? "",
      url,
    };
  }

  private extractRichText(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return "";

    const obj = value as Record<string, unknown>;

    if (typeof obj.text === "string" && obj.text.trim()) return obj.text;
    if (obj.text && typeof obj.text === "object") {
      const nested = this.extractRichText(obj.text);
      if (nested) return nested;
    }

    const paragraphs = obj.paragraphs as unknown[] | undefined;
    if (paragraphs?.length) {
      const joined = paragraphs
        .map((paragraph) => this.extractRichText(paragraph))
        .filter(Boolean)
        .join("\n");
      if (joined) return joined;
    }

    const nodes = obj.rich_text_nodes as unknown[] | undefined;
    if (nodes?.length) {
      return nodes.map((node) => this.extractRichText(node)).join("");
    }

    return "";
  }

  private normalizeSpaceDynamicItem(
    item: Record<string, unknown>,
  ): SpaceDynamicItem | null {
    const id = (item.id_str as string) ?? String(item.id ?? "");
    if (!id) return null;

    const type = (item.type as string) ?? "";
    const modules = item.modules as Record<string, unknown> | undefined;
    const moduleAuthor = modules?.module_author as
      | Record<string, unknown>
      | undefined;
    const pubTime =
      (moduleAuthor?.pub_ts as number) ??
      (moduleAuthor?.pub_time as number) ??
      0;

    const moduleDynamic = modules?.module_dynamic as
      | Record<string, unknown>
      | undefined;
    const major = moduleDynamic?.major as Record<string, unknown> | undefined;

    if (major?.archive) {
      const archive = major.archive as Record<string, unknown>;
      const stat = archive.stat as Record<string, unknown> | undefined;
      return {
        id,
        type,
        text: "",
        pubTime,
        title: (archive.title as string) ?? "",
        bvid: archive.bvid as string | undefined,
        cover: ((archive.cover as string) ?? "").replace(/^http:/, "https:"),
        stats: {
          view: Number(stat?.play) || 0,
          like: Number(stat?.like) || 0,
          reply: Number(stat?.reply) || 0,
        },
      };
    }

    if (major?.opus) {
      const opus = major.opus as Record<string, unknown>;
      return {
        id,
        type,
        text: this.extractRichText(opus.summary),
        pubTime,
        title: (opus.title as string) ?? "图文动态",
        cover: ((opus.cover as string) ?? "").replace(/^http:/, "https:"),
      };
    }

    const desc = moduleDynamic?.desc as Record<string, unknown> | undefined;
    const text =
      this.extractRichText(desc) ||
      this.extractRichText(moduleDynamic) ||
      (type.includes("FORWARD") ? "转发动态" : "动态");

    const coverMajor = major?.draw as Record<string, unknown> | undefined;
    const items = coverMajor?.items as Record<string, unknown>[] | undefined;

    return {
      id,
      type,
      text,
      pubTime,
      title: text.slice(0, 40) || "动态",
      cover: ((items?.[0]?.src as string) ?? "").replace(/^http:/, "https:"),
    };
  }

  private normalizeToViewItem(item: Record<string, unknown>): ToViewItem {
    const owner = item.owner as Record<string, unknown> | undefined;
    const stat = item.stat as Record<string, unknown> | undefined;

    return {
      bvid: item.bvid as string,
      aid: (item.aid as number) ?? 0,
      title: (item.title as string) ?? "",
      cover: this.normalizeVideoCoverUrl((item.pic as string) ?? ""),
      duration: (item.duration as number) ?? 0,
      play: (stat?.view as number) ?? 0,
      danmaku: (stat?.danmaku as number) ?? 0,
      owner: {
        mid: (owner?.mid as number) ?? 0,
        name: (owner?.name as string) ?? "",
        face: ((owner?.face as string) ?? "").replace(/^http:/, "https:"),
      },
      pubdate: 0,
      progress: (item.progress as number) ?? 0,
      addAt: (item.add_at as number) ?? 0,
      cid: (item.cid as number) ?? 0,
    };
  }

  private normalizeSearchVideo(item: Record<string, unknown>): VideoItem {
    const durationText = item.duration as string | undefined;
    let duration = 0;
    if (durationText?.includes(":")) {
      const parts = durationText.split(":").map(Number);
      if (parts.length === 2) duration = parts[0] * 60 + parts[1];
      if (parts.length === 3)
        duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    const title = String(item.title ?? "")
      .replace(/<em class="keyword">/g, "")
      .replace(/<\/em>/g, "");

    return {
      bvid: item.bvid as string,
      aid: (item.aid as number) ?? 0,
      title,
      cover: this.normalizeVideoCoverUrl((item.pic as string) ?? ""),
      duration,
      play: (item.play as number) ?? 0,
      danmaku: (item.video_review as number) ?? 0,
      owner: {
        mid: (item.mid as number) ?? 0,
        name: (item.author as string) ?? "",
        face: ((item.upic as string) ?? "").replace(/^http:/, "https:"),
      },
      pubdate:
        (item.pubdate as number) ??
        (item.pub_time as number) ??
        (item.ctime as number) ??
        0,
    };
  }
}

export const biliApi = new BiliApiService();
