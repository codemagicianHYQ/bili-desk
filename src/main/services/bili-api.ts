import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { createHash } from "crypto";
import { session } from "electron";
import { defaultHeaders, getCsrf, invalidateWbiCache, signParams } from "./wbi";
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
  UserRelationListPage,
  QrLoginResult,
  UpProfile,
  UpRelation,
  UserInfo,
  VideoDetail,
  VideoItem,
  VideoPlayInfo,
  DanmakuItem,
  SendDanmakuPayload,
  VideoRelation,
  AddCoinPayload,
  WatchHeartbeatPayload,
  CommentItem,
  CommentPage,
  UpVideosPage,
  UpVideosOrder,
  SearchOrder,
  SearchVideosPage,
  SearchUserItem,
  SearchUsersPage,
  SearchUserOrder,
  SearchUserTypeFilter,
  SearchTypeCounts,
  SearchArticleItem,
  SearchArticlesPage,
  SearchArticleOrder,
  ToViewItem,
  ToViewList,
  SpaceDynamicItem,
  SpaceDynamicPage,
  HistoryCursor,
  HistoryFeedType,
  HistoryItem,
  HistoryPage,
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
  LiveRoomItem,
  LiveRecommendPage,
  FollowingLivePage,
  LiveRoomDetail,
  LivePlayInfo,
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

function colorIntToHex(color: number): string {
  const value = Math.max(0, Math.min(0xffffff, color >>> 0));
  return `#${value.toString(16).padStart(6, "0")}`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

/** 解析经典弹幕 XML（`<d p="time,mode,size,color,...">text</d>`） */
const MAX_DANMAKU_ITEMS = 4000;

function parseDanmakuXml(xml: string): DanmakuItem[] {
  const items: DanmakuItem[] = [];
  // 超大弹幕 XML 直接截断，避免 IPC/主进程内存暴涨
  const source = xml.length > 2_000_000 ? xml.slice(0, 2_000_000) : xml;
  const regex = /<d p="([^"]+)">([^<]*)<\/d>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) != null) {
    if (items.length >= MAX_DANMAKU_ITEMS) break;
    const attrs = match[1]?.split(",") ?? [];
    const time = Number.parseFloat(attrs[0] ?? "0");
    const modeNum = Number.parseInt(attrs[1] ?? "1", 10);
    const color = Number.parseInt(attrs[3] ?? "16777215", 10);
    const text = decodeXmlEntities(match[2] ?? "").trim();
    if (!text || !Number.isFinite(time)) continue;

    items.push({
      text,
      time,
      color: colorIntToHex(Number.isFinite(color) ? color : 16777215),
      mode: modeNum === 5 ? 1 : modeNum === 4 ? 2 : 0,
    });
  }

  return items;
}

class BiliApiService {
  private client: AxiosInstance;
  private passportClient: AxiosInstance;
  private memberClient: AxiosInstance;
  private liveClient: AxiosInstance;

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

    this.liveClient = axios.create({
      baseURL: "https://api.live.bilibili.com",
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
    this.liveClient.interceptors.request.use(async (cfg) => {
      await this.ensureBuvid3();
      cfg.headers = {
        ...defaultHeaders(),
        Referer: "https://live.bilibili.com/",
        Origin: "https://live.bilibili.com",
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

  async getLiveRecommend(page = 1): Promise<LiveRecommendPage> {
    await this.ensureBuvid3();

    // 第 2 页起用可分页接口；失败则停止，绝不能回退到无分页的 getMoreRecList
    if (page > 1) {
      try {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/second/getUserRecommend",
          { params: { page } },
        );
        if (res.data?.code === 0) {
          const list = (res.data?.data?.list ??
            res.data?.data?.recommend_room_list ??
            []) as unknown[];
          const rooms = this.normalizeLiveRoomItems(list);
          const hasMoreFlag = res.data?.data?.has_more;
          const hasMore =
            typeof hasMoreFlag === "boolean"
              ? hasMoreFlag
              : typeof hasMoreFlag === "number"
                ? hasMoreFlag > 0
                : rooms.length > 0;
          return { rooms, page, hasMore };
        }
      } catch {
        // fall through
      }

      try {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/second/getList",
          {
            params: {
              platform: "web",
              parent_area_id: 0,
              area_id: 0,
              sort_type: "online",
              page,
            },
          },
        );
        if (res.data?.code === 0) {
          const list = (res.data?.data?.list ?? []) as unknown[];
          const rooms = this.normalizeLiveRoomItems(list);
          return { rooms, page, hasMore: rooms.length > 0 };
        }
      } catch {
        // fall through
      }

      return { rooms: [], page, hasMore: false };
    }

    const page1Candidates: Array<() => Promise<LiveRoomItem[]>> = [
      async () => {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/webMain/getMoreRecList",
          { params: { platform: "web" } },
        );
        if (res.data?.code !== 0) {
          throw new Error(String(res.data?.message ?? "getMoreRecList failed"));
        }
        return this.normalizeLiveRoomItems(
          (res.data?.data?.recommend_room_list ?? []) as unknown[],
        );
      },
      async () => {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/webMain/getList",
          { params: { platform: "web" } },
        );
        if (res.data?.code !== 0) {
          throw new Error(
            String(res.data?.message ?? "webMain/getList failed"),
          );
        }
        return this.normalizeLiveRoomItems(
          (res.data?.data?.recommend_room_list ?? []) as unknown[],
        );
      },
      async () => {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/index/getList",
          { params: { platform: "web" } },
        );
        if (res.data?.code !== 0) {
          throw new Error(String(res.data?.message ?? "index/getList failed"));
        }
        return this.normalizeLiveRoomItems(
          (res.data?.data?.recommend_room_list ?? []) as unknown[],
        );
      },
      async () => {
        const res = await this.liveClient.get(
          "/xlive/web-interface/v1/second/getList",
          {
            params: {
              platform: "web",
              parent_area_id: 0,
              area_id: 0,
              sort_type: "online",
              page: 1,
            },
          },
        );
        if (res.data?.code !== 0) {
          throw new Error(String(res.data?.message ?? "second/getList failed"));
        }
        return this.normalizeLiveRoomItems(
          (res.data?.data?.list ?? []) as unknown[],
        );
      },
    ];

    let lastError = "获取直播推荐失败";
    for (const fetchRooms of page1Candidates) {
      try {
        const rooms = await fetchRooms();
        if (rooms.length > 0) {
          return { rooms, page, hasMore: true };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
      }
    }

    throw new Error(lastError);
  }

  async getFollowingLives(): Promise<FollowingLivePage> {
    if (!isLoggedIn()) {
      return { rooms: [], count: 0 };
    }

    await this.ensureBuvid3();

    // hit_ab=false：前 10 条带完整昵称/标题；再补一次 true 拉全量并用已有字段兜底
    const [briefRes, fullRes] = await Promise.all([
      this.liveClient
        .get("/xlive/web-ucenter/v1/xfetter/GetWebList", {
          params: { hit_ab: false },
        })
        .catch(() => null),
      this.liveClient
        .get("/xlive/web-ucenter/v1/xfetter/GetWebList", {
          params: { hit_ab: true },
        })
        .catch(() => null),
    ]);

    const briefCode = briefRes?.data?.code;
    const fullCode = fullRes?.data?.code;
    if (briefCode !== 0 && fullCode !== 0) {
      const message =
        (briefRes?.data?.message as string) ||
        (fullRes?.data?.message as string) ||
        "获取关注直播失败";
      throw new Error(message);
    }

    const briefList = (briefRes?.data?.data?.rooms ??
      briefRes?.data?.data?.list ??
      []) as unknown[];
    const fullList = (fullRes?.data?.data?.rooms ??
      fullRes?.data?.data?.list ??
      []) as unknown[];

    const briefRooms = this.normalizeLiveRoomItems(briefList);
    const fullRooms = this.normalizeLiveRoomItems(fullList);
    const byId = new Map<number, LiveRoomItem>();
    for (const room of [...briefRooms, ...fullRooms]) {
      const prev = byId.get(room.roomId);
      if (!prev) {
        byId.set(room.roomId, room);
        continue;
      }
      byId.set(room.roomId, {
        ...prev,
        ...room,
        title: room.title || prev.title,
        uname: room.uname || prev.uname,
        face: room.face || prev.face,
        cover: room.cover || prev.cover,
      });
    }

    const rooms = [...byId.values()].filter(
      (room) => room.liveStatus === 1 || room.liveStatus === 2,
    );
    const count =
      Number(briefRes?.data?.data?.count) ||
      Number(fullRes?.data?.data?.count) ||
      rooms.length;

    return { rooms, count };
  }

  async getLiveRoom(roomId: number): Promise<LiveRoomDetail> {
    await this.ensureBuvid3();

    const res = await this.liveClient.get(
      "/xlive/web-room/v1/index/getInfoByRoom",
      { params: { room_id: roomId } },
    );

    if (res.data?.code === 0 && res.data?.data) {
      const data = res.data.data as Record<string, unknown>;
      const roomInfo = (data.room_info ?? {}) as Record<string, unknown>;
      const anchor = (data.anchor_info ?? {}) as Record<string, unknown>;
      const baseInfo = (anchor.base_info ?? {}) as Record<string, unknown>;
      return {
        roomId: Number(roomInfo.room_id ?? roomId),
        shortId: Number(roomInfo.short_id) || undefined,
        title: String(roomInfo.title ?? "直播间"),
        cover: this.normalizeHttps(
          String(roomInfo.cover ?? roomInfo.keyframe ?? ""),
        ),
        online: Number(roomInfo.online ?? 0),
        areaName: String(roomInfo.area_name ?? ""),
        parentAreaName: String(roomInfo.parent_area_name ?? "") || undefined,
        liveStatus: Number(roomInfo.live_status ?? 0),
        liveStartTime: Number(roomInfo.live_start_time) || undefined,
        description: String(roomInfo.description ?? "") || undefined,
        uid: Number(roomInfo.uid ?? baseInfo.uid ?? 0),
        uname: String(baseInfo.uname ?? ""),
        face: this.normalizeHttps(String(baseInfo.face ?? "")),
      };
    }

    // 降级：基础房间信息
    const basic = await this.liveClient.get("/room/v1/Room/get_info", {
      params: { room_id: roomId },
    });
    if (basic.data?.code !== 0 || !basic.data?.data) {
      throw new Error(
        (res.data?.message as string) ||
          (basic.data?.message as string) ||
          "直播间信息获取失败",
      );
    }
    const info = basic.data.data as Record<string, unknown>;
    return {
      roomId: Number(info.room_id ?? roomId),
      shortId: Number(info.short_id) || undefined,
      title: String(info.title ?? "直播间"),
      cover: this.normalizeHttps(
        String(info.user_cover ?? info.keyframe ?? ""),
      ),
      online: Number(info.online ?? 0),
      areaName: String(info.area_name ?? ""),
      parentAreaName: String(info.parent_area_name ?? "") || undefined,
      liveStatus: Number(info.live_status ?? 0),
      liveStartTime: Number(info.live_time) || undefined,
      description: String(info.description ?? "") || undefined,
      uid: Number(info.uid ?? 0),
      uname: "",
      face: "",
    };
  }

  async getLivePlayUrl(roomId: number, qn = 400): Promise<LivePlayInfo> {
    await this.ensureBuvid3();

    const requestPlayInfo = async (quality: number) => {
      // 同时要 AVC/HEVC/AV1：仅 codec=0 时部分房间会返回空流
      const res = await this.liveClient.get(
        "/xlive/web-room/v2/index/getRoomPlayInfo",
        {
          params: {
            room_id: roomId,
            no_playurl: 0,
            mask: 1,
            protocol: "0,1",
            format: "0,1,2",
            codec: "0,1,2",
            qn: quality,
            platform: "web",
            ptype: 8,
            dolby: 5,
            panorama: 1,
          },
        },
      );
      return res;
    };

    let res = await requestPlayInfo(qn);
    if (res.data?.code !== 0) {
      const code = Number(res.data?.code);
      const message = String(res.data?.message ?? "").trim();
      if (code === -352) {
        throw new Error("直播流风控校验失败，请稍后重试或重新登录");
      }
      throw new Error(message || "获取直播流失败");
    }

    let data = res.data?.data as Record<string, unknown> | undefined;
    const liveStatus = Number(data?.live_status ?? 0);
    if (liveStatus !== 1) {
      throw new Error(liveStatus === 2 ? "主播轮播中" : "主播未开播");
    }

    let playurl = ((data?.playurl_info as Record<string, unknown> | undefined)
      ?.playurl ?? {}) as Record<string, unknown>;
    let gQnDesc = (playurl.g_qn_desc ?? []) as Array<Record<string, unknown>>;
    let streams = (playurl.stream ?? []) as Array<Record<string, unknown>>;
    let picked = this.pickLiveStreamUrl(streams, qn);

    // 指定清晰度可能无对应编码，回退自动清晰度再试一次
    if (!picked && qn !== 0) {
      res = await requestPlayInfo(0);
      if (res.data?.code === 0) {
        data = res.data?.data as Record<string, unknown> | undefined;
        playurl = ((data?.playurl_info as Record<string, unknown> | undefined)
          ?.playurl ?? {}) as Record<string, unknown>;
        gQnDesc = (playurl.g_qn_desc ?? []) as Array<Record<string, unknown>>;
        streams = (playurl.stream ?? []) as Array<Record<string, unknown>>;
        picked = this.pickLiveStreamUrl(streams, qn);
      }
    }

    // v2 仍失败时降级旧版 playUrl（多数房间至少能给出 flv）
    if (!picked) {
      const legacy = await this.getLegacyLivePlayUrl(roomId);
      if (legacy) return legacy;
      throw new Error("未找到可用的直播流地址");
    }

    const labelMap = new Map<number, string>();
    for (const item of gQnDesc) {
      const id = Number(item.qn);
      const desc = String(item.desc ?? "");
      if (Number.isFinite(id) && desc) labelMap.set(id, desc);
    }

    const qualities = (
      picked.acceptQn.length > 0 ? picked.acceptQn : [picked.qn]
    ).map((id) => ({
      qn: id,
      label: labelMap.get(id) ?? this.liveQualityLabel(id),
    }));

    return {
      url: picked.url,
      format: picked.format,
      quality: picked.qn,
      qualityLabel: labelMap.get(picked.qn) ?? this.liveQualityLabel(picked.qn),
      qualities,
    };
  }

  private async getLegacyLivePlayUrl(
    roomId: number,
  ): Promise<LivePlayInfo | null> {
    try {
      const res = await this.liveClient.get("/room/v1/Room/playUrl", {
        params: {
          cid: roomId,
          platform: "web",
          quality: 4,
          qn: 400,
        },
      });
      if (res.data?.code !== 0) return null;
      const data = res.data?.data as Record<string, unknown> | undefined;
      const durl = (data?.durl ?? []) as Array<Record<string, unknown>>;
      const url = String(durl[0]?.url ?? "");
      if (!url.startsWith("http")) return null;

      const currentQn = Number(data?.current_quality ?? 400);
      const accept = (
        Array.isArray(data?.accept_quality) ? data.accept_quality : [currentQn]
      )
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      return {
        url,
        format: "flv",
        quality: Number.isFinite(currentQn) ? currentQn : 400,
        qualityLabel: this.liveQualityLabel(
          Number.isFinite(currentQn) ? currentQn : 400,
        ),
        qualities: accept.map((id) => ({
          qn: id,
          label: this.liveQualityLabel(id),
        })),
      };
    } catch {
      return null;
    }
  }

  private liveQualityLabel(qn: number): string {
    const map: Record<number, string> = {
      10000: "原画",
      400: "蓝光",
      250: "超清",
      150: "高清",
      80: "流畅",
    };
    return map[qn] ?? `${qn}P`;
  }

  private pickLiveStreamUrl(
    streams: Array<Record<string, unknown>>,
    preferredQn: number,
  ): {
    url: string;
    format: "flv" | "hls";
    qn: number;
    acceptQn: number[];
  } | null {
    const protocolPrefer = ["http_stream", "http_hls"];
    // Electron 优先 AVC；没有 AVC 时再退 HEVC/AV1，避免整页拉流失败
    const codecPrefer = ["avc", "hevc", "hev", "av1", "h264", "h265"];
    const formatPrefer = ["flv", "fmp4", "ts"];

    type Candidate = {
      url: string;
      format: "flv" | "hls";
      qn: number;
      acceptQn: number[];
      score: number;
    };

    const candidates: Candidate[] = [];

    const codecRank = (name: string): number => {
      const lower = name.toLowerCase();
      // codec_name 可能是 "avc" / "hevc"，少数响应也可能是 "0"/"1"/"2"
      if (!lower || lower === "0") return 0;
      if (lower === "1") return 1;
      if (lower === "2") return 3;
      const idx = codecPrefer.findIndex(
        (key) => lower === key || lower.includes(key),
      );
      return idx < 0 ? 50 : idx;
    };

    for (const stream of streams) {
      const protocolName = String(stream.protocol_name ?? "");
      const protocolScore = protocolPrefer.indexOf(protocolName);
      const formats = (stream.format ?? []) as Array<Record<string, unknown>>;

      for (const format of formats) {
        const formatName = String(format.format_name ?? "");
        const formatScore = formatPrefer.indexOf(formatName);
        const codecs = (format.codec ?? []) as Array<Record<string, unknown>>;

        for (const codec of codecs) {
          const codecName = String(codec.codec_name ?? "");
          const baseUrl = String(codec.base_url ?? "");
          const urlInfos = (codec.url_info ?? []) as Array<
            Record<string, unknown>
          >;
          if (!baseUrl || urlInfos.length === 0) continue;

          for (const info of urlInfos) {
            const host = String(info.host ?? "").trim();
            const extra = String(info.extra ?? "");
            let url = `${host}${baseUrl}${extra}`;
            if (url.startsWith("//")) url = `https:${url}`;
            if (!/^https?:\/\//i.test(url)) continue;

            const acceptQn = (
              Array.isArray(codec.accept_qn) ? codec.accept_qn : []
            )
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value));
            const currentQn = Number(codec.current_qn ?? preferredQn);
            const qn = Number.isFinite(currentQn) ? currentQn : preferredQn;
            const qnScore =
              preferredQn > 0 && qn === preferredQn
                ? 0
                : preferredQn > 0 && acceptQn.includes(preferredQn)
                  ? 1
                  : 2;

            candidates.push({
              url,
              format: formatName === "flv" ? "flv" : "hls",
              qn,
              acceptQn,
              score:
                codecRank(codecName) * 1000 +
                (formatScore < 0 ? 99 : formatScore) * 100 +
                (protocolScore < 0 ? 99 : protocolScore) * 10 +
                qnScore,
            });
          }
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    return {
      url: best.url,
      format: best.format,
      qn: best.qn,
      acceptQn: best.acceptQn,
    };
  }

  private normalizeHttps(url: string): string {
    return url.replace(/^http:/, "https:");
  }

  private normalizeLiveRoomItems(items: unknown[]): LiveRoomItem[] {
    return items
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .map((item) => this.normalizeLiveRoomItem(item))
      .filter((item) => item.roomId > 0);
  }

  private normalizeLiveRoomItem(item: Record<string, unknown>): LiveRoomItem {
    const watched = (item.watched_show ?? {}) as Record<string, unknown>;
    const roomIdRaw = item.roomid ?? item.room_id ?? item.roomId ?? undefined;
    let roomId = Number(roomIdRaw ?? 0);
    if (!roomId && typeof item.link === "string") {
      const match = item.link.match(/(\d+)/);
      roomId = match ? Number(match[1]) : 0;
    }
    const cover = this.normalizeHttps(
      String(
        item.cover ??
          item.keyframe ??
          item.cover_from_user ??
          item.user_cover ??
          "",
      ),
    );
    const online = Number(item.online ?? watched.num ?? item.watched_num ?? 0);
    const onlineText =
      (watched.text_small as string) ||
      (watched.text_large as string) ||
      undefined;

    return {
      roomId,
      title: String(item.title ?? item.roomname ?? item.room_name ?? "直播间"),
      cover,
      online,
      onlineText,
      areaName: String(
        item.area_v2_name ?? item.area_name ?? item.areaName ?? "",
      ),
      parentAreaName:
        String(
          item.area_v2_parent_name ??
            item.parent_area_name ??
            item.parentAreaName ??
            "",
        ) || undefined,
      uid: Number(item.uid ?? item.mid ?? 0),
      uname: String(item.uname ?? item.nickname ?? item.name ?? ""),
      face: this.normalizeHttps(
        String(item.face ?? item.user_cover ?? item.avatar ?? ""),
      ),
      liveStatus: (() => {
        if (item.live_status != null) return Number(item.live_status);
        if (item.liveStatus != null) return Number(item.liveStatus);
        if (item.status === true) return 1;
        if (item.status === false) return 0;
        // 推荐流里的房间默认视为直播中
        return 1;
      })(),
      keyframe: this.normalizeHttps(String(item.keyframe ?? "")) || undefined,
    };
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
        share: view.stat?.share ?? 0,
        like: view.stat?.like ?? 0,
      },
    };
  }

  async getVideoRelation(bvid: string, aid: number): Promise<VideoRelation> {
    await this.ensureBuvid3();
    const res = await this.client.get("/x/web-interface/archive/relation", {
      params: { bvid, aid },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "互动状态获取失败");
    }

    const data = res.data?.data ?? {};
    const coin = Number(data.coin) || 0;
    return {
      liked: Number(data.like) === 1,
      coined: coin > 0,
      coin,
      favorited: Number(data.favorite) === 1,
    };
  }

  async likeVideo(aid: number, like: boolean): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再点赞");

    const body = new URLSearchParams({
      aid: String(aid),
      like: like ? "1" : "2",
      csrf,
    });

    const res = await this.client.post("/x/web-interface/archive/like", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.bilibili.com/",
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "点赞失败");
    }
  }

  async addCoin(payload: AddCoinPayload): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再投币");

    const multiply = payload.multiply === 2 ? 2 : 1;
    const body = new URLSearchParams({
      aid: String(payload.aid),
      multiply: String(multiply),
      select_like: payload.selectLike ? "1" : "0",
      csrf,
    });

    const res = await this.client.post("/x/web-interface/coin/add", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `https://www.bilibili.com/video/${payload.bvid}`,
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "投币失败");
    }
  }

  async shareVideo(aid: number, bvid: string): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再分享");

    const body = new URLSearchParams({
      aid: String(aid),
      eabee: "",
      csrf,
    });

    const res = await this.client.post("/x/web-interface/share/add", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `https://www.bilibili.com/video/${bvid}`,
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "分享失败");
    }
  }

  /**
   * 上报观看心跳 + 历史进度，同步到账号历史记录（官方客户端可见）
   */
  async reportWatchHeartbeat(payload: WatchHeartbeatPayload): Promise<void> {
    if (!isLoggedIn()) return;

    const csrf = getCsrf();
    if (!csrf) return;

    const playedTime = Math.floor(payload.playedTime);
    const realtime = Math.max(
      0,
      Math.floor(payload.realtime ?? Math.max(0, playedTime)),
    );
    const referer = `https://www.bilibili.com/video/${payload.bvid}`;
    const mid = this.getAuthStatus().mid;

    const heartbeatBody = new URLSearchParams({
      aid: String(payload.aid),
      bvid: payload.bvid,
      cid: String(payload.cid),
      mid: String(mid || 0),
      played_time: String(playedTime),
      realtime: String(realtime),
      real_played_time: String(realtime),
      start_ts: String(payload.startTs),
      type: "3",
      dt: "2",
      play_type: String(payload.playType),
      csrf,
    });
    if (payload.quality != null) {
      heartbeatBody.set("quality", String(payload.quality));
    }

    const heartbeatRes = await this.client.post(
      "/x/click-interface/web/heartbeat",
      heartbeatBody,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: referer,
        },
        validateStatus: () => true,
      },
    );

    // 历史写入不阻塞播放；失败时尽量走专用 report 兜底
    const historyProgress = playedTime < 0 ? 0 : Math.max(0, playedTime);
    const historyBody = new URLSearchParams({
      aid: String(payload.aid),
      cid: String(payload.cid),
      progress: String(historyProgress),
      csrf,
    });

    const historyRes = await this.client.post(
      "/x/v2/history/report",
      historyBody,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: referer,
        },
        validateStatus: () => true,
      },
    );

    const heartbeatOk =
      heartbeatRes.status !== 412 &&
      heartbeatRes.data?.code !== -412 &&
      heartbeatRes.data?.code === 0;
    const historyOk =
      historyRes.status !== 412 &&
      historyRes.data?.code !== -412 &&
      historyRes.data?.code === 0;

    if (!heartbeatOk && !historyOk) {
      // 静默失败，避免打断播放或刷 IPC 错误日志
      return;
    }
  }

  async getPlayUrl(
    bvid: string,
    cid: number,
    qn = 64,
    options?: { preferMp4?: boolean },
  ): Promise<VideoPlayInfo> {
    await this.ensureBuvid3();

    const referer = `https://www.bilibili.com/video/${bvid}`;
    const preferMp4 = Boolean(options?.preferMp4);

    const tryDash = async (): Promise<VideoPlayInfo | null> => {
      const dashParams = await signParams({
        bvid,
        cid,
        qn,
        fnval: 16,
        fnver: 0,
        fourk: 0,
        platform: "pc",
        high_quality: 1,
      });

      const dashRes = await this.client.get("/x/player/wbi/playurl", {
        params: dashParams,
        headers: { Referer: referer },
        validateStatus: () => true,
      });
      if (dashRes.data?.code !== 0) return null;
      return this.buildPlayInfoFromDash(dashRes.data?.data, qn);
    };

    const tryMp4 = async (): Promise<VideoPlayInfo | null> => {
      const mp4Params = await signParams({
        bvid,
        cid,
        qn,
        fnval: 1,
        fnver: 0,
        fourk: 0,
        platform: "pc",
      });

      const mp4Res = await this.client.get("/x/player/wbi/playurl", {
        params: mp4Params,
        headers: { Referer: referer },
        validateStatus: () => true,
      });
      if (mp4Res.data?.code !== 0) return null;
      const mp4Data = mp4Res.data?.data;
      const mp4Stream = mp4Data?.durl?.[0] as
        | { url?: string; format?: string; backup_url?: string[] }
        | undefined;
      if (!mp4Stream?.url) return null;
      return this.buildPlayInfoFromDurl(mp4Data, mp4Stream, qn);
    };

    // 并行取流，避免串行多等一轮；桌面端优先 MP4 首帧更快
    const [dash, mp4] = await Promise.all([tryDash(), tryMp4()]);
    if (preferMp4) {
      if (mp4) return mp4;
      if (dash) return dash;
    } else {
      if (mp4) return mp4;
      if (dash) return dash;
    }

    throw new Error("该视频暂不支持在线播放，可能为付费或受限内容");
  }

  async getDanmakuList(cid: number): Promise<DanmakuItem[]> {
    await this.ensureBuvid3();

    const res = await this.client.get("/x/v1/dm/list.so", {
      params: { oid: cid },
      responseType: "text",
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }

    const xml =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return parseDanmakuXml(xml);
  }

  async sendDanmaku(payload: SendDanmakuPayload): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再发送弹幕");

    const message = payload.message.trim();
    if (!message) throw new Error("弹幕内容不能为空");
    if (message.length > 100) throw new Error("弹幕最多 100 个字");

    const body = new URLSearchParams({
      type: "1",
      oid: String(payload.cid),
      msg: message,
      mode: String(payload.mode ?? 1),
      fontsize: String(payload.fontsize ?? 25),
      color: String(payload.color ?? 16777215),
      progress: String(Math.max(0, Math.floor(payload.progress))),
      bvid: payload.bvid,
      rnd: String(Date.now() * 1000),
      csrf,
    });

    const res = await this.client.post("/x/v2/dm/post", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `https://www.bilibili.com/video/${payload.bvid}`,
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "发送弹幕失败");
    }
  }

  async getComments(
    aid: number,
    page = 1,
    sort: 0 | 1 | 2 = 0,
  ): Promise<CommentPage> {
    await this.ensureBuvid3();
    const pageSize = 20;
    // 经典接口：sort=2 热度，sort=0 时间
    const apiSort = sort === 2 ? 0 : 2;

    const res = await this.client.get("/x/v2/reply", {
      params: {
        type: 1,
        oid: aid,
        pn: page,
        ps: pageSize,
        sort: apiSort,
      },
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "评论加载失败");
    }

    return this.normalizeCommentPage(res.data?.data, page, pageSize);
  }

  async getCommentReplies(
    aid: number,
    root: number,
    page = 1,
  ): Promise<CommentPage> {
    await this.ensureBuvid3();
    const pageSize = 10;

    const res = await this.client.get("/x/v2/reply/reply", {
      params: {
        type: 1,
        oid: aid,
        root,
        pn: page,
        ps: pageSize,
      },
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "楼中楼加载失败");
    }

    return this.normalizeCommentPage(res.data?.data, page, pageSize);
  }

  async addComment(
    aid: number,
    message: string,
    root = 0,
    parent = 0,
  ): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再发表评论");

    const text = message.trim();
    if (!text) throw new Error("评论内容不能为空");

    const body = new URLSearchParams({
      type: "1",
      oid: String(aid),
      message: text,
      csrf,
    });
    if (root > 0) body.set("root", String(root));
    if (parent > 0) body.set("parent", String(parent));

    const res = await this.client.post("/x/v2/reply/add", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.bilibili.com/",
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "发表评论失败");
    }
  }

  async likeComment(aid: number, rpid: number, like: boolean): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再点赞");

    const body = new URLSearchParams({
      type: "1",
      oid: String(aid),
      rpid: String(rpid),
      action: like ? "1" : "0",
      csrf,
    });

    const res = await this.client.post("/x/v2/reply/action", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://www.bilibili.com/",
      },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "点赞失败");
    }
  }

  private normalizeCommentPage(
    data: Record<string, unknown> | undefined,
    page: number,
    pageSize: number,
  ): CommentPage {
    const rawReplies = data?.replies;
    const replies = (Array.isArray(rawReplies) ? rawReplies : []) as Record<
      string,
      unknown
    >[];
    const pageInfo = data?.page as
      | { num?: number; size?: number; count?: number; acount?: number }
      | undefined;
    const count = pageInfo?.count ?? replies.length;
    const acount = pageInfo?.acount ?? count;

    const comments = replies
      .map((item) => this.normalizeCommentItem(item))
      .filter((item): item is CommentItem => item != null);

    // 以本页实际条数为准：空页 / 不足一页即视为没有更多，避免 hasMore 虚高导致无限请求
    const hasMore =
      comments.length >= pageSize && page * pageSize < Math.max(count, 1);

    return {
      comments,
      page,
      pageSize,
      count,
      acount,
      hasMore,
    };
  }

  private normalizeCommentItem(
    item: Record<string, unknown>,
  ): CommentItem | null {
    const rpid = Number(item.rpid);
    if (!Number.isFinite(rpid) || rpid <= 0) return null;

    const member = (item.member ?? {}) as Record<string, unknown>;
    const content = (item.content ?? {}) as Record<string, unknown>;
    const replyControl = (item.reply_control ?? {}) as Record<string, unknown>;
    const nested = (item.replies ?? []) as Record<string, unknown>[];

    const locationRaw = String(
      replyControl.location ?? item.location ?? content.ip_label ?? "",
    ).trim();
    const location = locationRaw.replace(/^IP属地[:：]?\s*/i, "").trim();

    const pictures = this.extractCommentPictures(content.pictures);

    return {
      rpid,
      oid: Number(item.oid) || 0,
      mid: Number(item.mid) || Number(member.mid) || 0,
      root: Number(item.root) || 0,
      parent: Number(item.parent) || 0,
      content: String(content.message ?? ""),
      emotes: this.extractCommentEmotes(content.emote),
      pictures,
      location: location || undefined,
      like: Number(item.like) || 0,
      action: Number(item.action) || 0,
      ctime: Number(item.ctime) || 0,
      rcount: Number(item.rcount) || 0,
      member: {
        mid: Number(member.mid) || 0,
        name: String(member.uname || member.name || "用户"),
        face: this.normalizeBfsUrl(String(member.avatar || member.face || "")),
        level: Number(
          (member.level_info as { current_level?: number } | undefined)
            ?.current_level,
        ),
        sex: String(member.sex || ""),
      },
      replies: nested
        .map((reply) => this.normalizeCommentItem(reply))
        .filter((reply): reply is CommentItem => reply != null),
    };
  }

  private extractCommentPictures(
    raw: unknown,
  ): CommentItem["pictures"] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    const pictures: NonNullable<CommentItem["pictures"]> = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const pic = entry as Record<string, unknown>;
      const src = this.normalizeHttps(
        String(pic.img_src ?? pic.src ?? pic.url ?? ""),
      );
      if (!src) continue;
      pictures.push({
        src,
        width: Number(pic.img_width ?? pic.width) || 0,
        height: Number(pic.img_height ?? pic.height) || 0,
      });
    }
    return pictures.length > 0 ? pictures : undefined;
  }

  private extractCommentEmotes(
    raw: unknown,
  ): Record<string, string> | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!key.startsWith("[")) continue;
      if (typeof value === "string" && value) {
        result[key] = value.replace(/^http:/, "https:");
        continue;
      }
      if (value && typeof value === "object") {
        const url = String((value as { url?: string }).url ?? "").replace(
          /^http:/,
          "https:",
        );
        if (url) result[key] = url;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  async getReplyEmotes(): Promise<Record<string, string>> {
    await this.ensureBuvid3();
    const res = await this.client.get("/x/emote/user/panel/web", {
      params: { business: "reply" },
      headers: { Referer: "https://www.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      return {};
    }

    const packages =
      ((res.data?.data as Record<string, unknown> | undefined)?.packages as
        | Record<string, unknown>[]
        | undefined) ?? [];
    const map: Record<string, string> = {};
    for (const pkg of packages) {
      const emotes = (pkg.emote as Record<string, unknown>[] | undefined) ?? [];
      for (const emote of emotes) {
        const text = String(emote.text ?? "");
        const url = String(emote.url ?? "").replace(/^http:/, "https:");
        if (text.startsWith("[") && url) map[text] = url;
      }
    }
    return map;
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
      backupUrl?: string[];
      backup_url?: string[];
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

    const allVideos = (dash.video as DashStream[] | undefined) ?? [];
    // 只取 AVC：HEVC/AV1 在 Electron 里常走软解，首帧会卡十几秒
    const videos = allVideos.filter(
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

    const collectBackupUrls = (item: DashStream): string[] => {
      const raw = item.backupUrl ?? item.backup_url ?? [];
      return raw.filter(
        (url): url is string => typeof url === "string" && !!url,
      );
    };

    const video = pickByQn(videos, requestedQn);
    const audios = (dash.audio as DashStream[] | undefined) ?? [];
    const audio =
      audios.find((item) => item.id === 30280) ??
      audios.find((item) => item.id === 30232) ??
      audios.find((item) => item.id === 30216) ??
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
      .map((value) => ({
        qn: value,
        label: acceptDescription[acceptQuality.indexOf(value)] ?? `${value}P`,
      }));

    if (qualities.length === 0) {
      qualities.push({ qn: video.id, label: `${video.id}P` });
    }

    const quality = video.id;
    const qualityIndex = acceptQuality.indexOf(quality);

    const timeLengthSec = Number(data.timelength)
      ? Number(data.timelength) / 1000
      : 0;
    const dashDuration = Number(dash.duration) || 0;
    const duration = Math.max(1, Math.ceil(dashDuration || timeLengthSec || 1));

    const dashPayload = {
      duration,
      video: {
        id: video.id,
        baseUrl: videoUrl,
        backupUrls: collectBackupUrls(video),
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
        backupUrls: collectBackupUrls(audio),
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

  /** 从指定收藏夹批量移除视频（resources 格式 aid:2） */
  async removeFavResources(mediaId: number, aids: number[]): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再操作收藏夹");

    const uniqueAids = [...new Set(aids.filter((aid) => aid > 0))];
    if (uniqueAids.length === 0) return;

    const chunkSize = 40;
    for (let i = 0; i < uniqueAids.length; i += chunkSize) {
      const chunk = uniqueAids.slice(i, i + chunkSize);
      const res = await this.client.post(
        "/x/v3/fav/resource/batch-del",
        new URLSearchParams({
          media_id: String(mediaId),
          resources: chunk.map((aid) => `${aid}:2`).join(","),
          csrf,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: "https://www.bilibili.com/",
            Origin: "https://www.bilibili.com",
          },
          validateStatus: () => true,
        },
      );

      if (res.status === 412 || res.data?.code === -412) {
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
      }
      if (res.data?.code !== 0) {
        throw new Error((res.data?.message as string) || "移除收藏失败");
      }
    }
  }

  /** 批量移动收藏：从源收藏夹移到目标收藏夹 */
  async moveFavResources(
    srcMediaId: number,
    tarMediaId: number,
    aids: number[],
  ): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再操作收藏夹");
    if (srcMediaId === tarMediaId) {
      throw new Error("目标收藏夹不能与当前收藏夹相同");
    }

    const uniqueAids = [...new Set(aids.filter((aid) => aid > 0))];
    if (uniqueAids.length === 0) return;

    const chunkSize = 40;
    for (let i = 0; i < uniqueAids.length; i += chunkSize) {
      const chunk = uniqueAids.slice(i, i + chunkSize);
      const res = await this.client.post(
        "/x/v3/fav/resource/move",
        new URLSearchParams({
          src_media_id: String(srcMediaId),
          tar_media_id: String(tarMediaId),
          resources: chunk.map((aid) => `${aid}:2`).join(","),
          platform: "web",
          csrf,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: "https://www.bilibili.com/",
            Origin: "https://www.bilibili.com",
          },
          validateStatus: () => true,
        },
      );

      if (res.status === 412 || res.data?.code === -412) {
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
      }
      if (res.data?.code !== 0) {
        throw new Error((res.data?.message as string) || "移动收藏失败");
      }
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

  /** 查看指定用户的关注 / 粉丝列表（含隐私校验） */
  async getUserRelationList(
    mid: number,
    type: "followings" | "followers",
    page = 1,
  ): Promise<UserRelationListPage> {
    await this.ensureBuvid3();

    const pageSize = 24;
    const path =
      type === "followers" ? "/x/relation/followers" : "/x/relation/followings";

    const res = await this.client.get(path, {
      params: {
        vmid: String(mid),
        pn: Math.max(1, page),
        ps: pageSize,
        order: "desc",
        order_type: "",
      },
      headers: {
        Referer: `https://space.bilibili.com/${mid}/fans/${type === "followers" ? "fans" : "follow"}`,
      },
      validateStatus: () => true,
    });

    const code = res.data?.code as number | undefined;
    const message = String(res.data?.message ?? "");

    if (
      code === 22115 ||
      code === 22116 ||
      message.includes("隐私") ||
      message.includes("不可见") ||
      message.includes("隐藏")
    ) {
      // 隐私是正常业务结果，不要 throw，避免 IPC 刷红错日志
      return {
        users: [],
        page: Math.max(1, page),
        total: 0,
        hasMore: false,
        privacyBlocked: true,
        message:
          type === "followers"
            ? "由于该用户隐私设置，粉丝列表不可见"
            : "由于该用户隐私设置，关注列表不可见",
      };
    }

    if (code === -101 || message.includes("未登录")) {
      throw new Error("请先登录后再查看");
    }

    if (code !== 0) {
      throw new Error(
        message ||
          (type === "followers" ? "粉丝列表获取失败" : "关注列表获取失败"),
      );
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const list = (data?.list ?? []) as Record<string, unknown>[];
    const users = list.map((u) => this.mapFollowingUser(u));
    const total = Number(data?.total ?? users.length) || 0;

    return {
      users,
      page: Math.max(1, page),
      total,
      hasMore: users.length >= pageSize && page * pageSize < total,
    };
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
      isFollowing: attribute === 1 || attribute === 2 || attribute === 6,
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

    const accParams = await signParams({ mid: String(mid) });
    const [cardRes, statRes, upstatRes, navnumRes, accRes] = await Promise.all([
      this.client.get("/x/web-interface/card", {
        params: { mid: String(mid), photo: true },
        validateStatus: () => true,
      }),
      this.client.get("/x/relation/stat", {
        params: { vmid: String(mid) },
        validateStatus: () => true,
      }),
      this.client
        .get("/x/space/upstat", {
          params: { mid: String(mid) },
          headers: { Referer: `https://space.bilibili.com/${mid}` },
          validateStatus: () => true,
        })
        .catch(() => null),
      this.client
        .get("/x/space/navnum", {
          params: { mid: String(mid) },
          headers: { Referer: `https://space.bilibili.com/${mid}` },
          validateStatus: () => true,
        })
        .catch(() => null),
      this.client
        .get("/x/space/wbi/acc/info", {
          params: accParams,
          headers: { Referer: `https://space.bilibili.com/${mid}` },
          validateStatus: () => true,
        })
        .catch(() => null),
    ]);

    if (cardRes.data?.code !== 0) {
      throw new Error(
        this.formatUserSpaceApiError(
          cardRes.data?.code,
          cardRes.data?.message,
          "UP 主信息获取失败",
        ),
      );
    }

    const payload = cardRes.data?.data as Record<string, unknown> | undefined;
    const card = payload?.card as Record<string, unknown> | undefined;
    const levelInfo = card?.level_info as
      | { current_level?: number }
      | undefined;
    const official = (card?.Official ?? card?.official) as
      | { title?: string; desc?: string; type?: number }
      | undefined;
    const officialVerify = card?.official_verify as
      | { desc?: string; type?: number }
      | undefined;

    const stat = statRes.data?.data as Record<string, unknown> | undefined;
    const upstat =
      upstatRes && (upstatRes as AxiosResponse).data?.code === 0
        ? ((upstatRes as AxiosResponse).data?.data as Record<string, unknown>)
        : undefined;
    const archiveStat = upstat?.archive as { view?: number } | undefined;
    const navnum =
      navnumRes && (navnumRes as AxiosResponse).data?.code === 0
        ? ((navnumRes as AxiosResponse).data?.data as Record<string, unknown>)
        : undefined;
    const accData =
      accRes && (accRes as AxiosResponse).data?.code === 0
        ? ((accRes as AxiosResponse).data?.data as Record<string, unknown>)
        : undefined;

    const officialDesc =
      (typeof official?.title === "string" && official.title.trim()) ||
      (typeof official?.desc === "string" && official.desc.trim()) ||
      (typeof officialVerify?.desc === "string" &&
        officialVerify.desc.trim()) ||
      "";

    const videos = Number(payload?.archive_count ?? navnum?.video ?? 0) || 0;

    // navnum.favourite 是 { master, guest }，不是数字
    const favRaw = navnum?.favourite as
      | number
      | { master?: number; guest?: number }
      | undefined;
    const favourites =
      typeof favRaw === "number"
        ? favRaw
        : Number(favRaw?.guest ?? favRaw?.master ?? 0) || 0;

    return {
      mid,
      name: (card?.name as string) ?? "",
      face: (card?.face as string) ?? "",
      sign: (card?.sign as string) ?? (accData?.sign as string) ?? "",
      fans:
        (stat?.follower as number) ??
        (payload?.follower as number) ??
        (card?.fans as number) ??
        0,
      following: (stat?.following as number) ?? (card?.friend as number) ?? 0,
      videos,
      level: Number(levelInfo?.current_level ?? accData?.level ?? 0) || 0,
      officialDesc: officialDesc || undefined,
      likes: Number(payload?.like_num ?? upstat?.likes ?? 0) || 0,
      archiveViews: Number(archiveStat?.view ?? 0) || 0,
      favourites,
      topPhoto: this.normalizeBfsUrl(
        (accData?.top_photo as string) ??
          ((payload?.space as { l_img?: string } | undefined)
            ?.l_img as string) ??
          "",
      ),
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
    // 分类任务批量调用：只打一枪空间接口，避免拖垮主进程
    try {
      const page = await this.fetchSpaceArcList(mid, 1, "pubdate");
      return page.videos.slice(0, limit).map((video) => video.title);
    } catch {
      return [];
    }
  }

  async getUpVideos(
    mid: number,
    page = 1,
    order: UpVideosOrder = "pubdate",
  ): Promise<UpVideosPage> {
    await this.ensureBuvid3();

    const sort = order === "click" ? "click" : "pubdate";
    const currentUser = this.getAuthStatus();
    if (sort === "pubdate" && currentUser.isLogin && currentUser.mid === mid) {
      try {
        return await this.fetchMyArchives(page);
      } catch {
        // fall back
      }
    }

    let lastError: Error | null = null;

    // 1) 空间投稿（唯一主通道）
    try {
      const space = await this.fetchSpaceArcList(mid, page, sort);
      if (space.videos.length > 0) return space;
      if (page === 1 && space.total === 0) {
        return { videos: [], page: 1, total: 0, hasMore: false };
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("投稿列表获取失败");
    }

    // 2) 搜索兜底（不再走已失效的 cursor，避免「请求错误」盖掉可用结果）
    try {
      const upName = await this.fetchUpName(mid);
      if (!upName) {
        throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
      }
      const fallback = await this.fetchUpVideosBySearchPaged(
        mid,
        upName,
        page,
        sort,
        0,
      );
      if (fallback.videos.length > 0) return fallback;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : (lastError ?? new Error("投稿列表获取失败"));
    }

    throw (
      lastError ??
      new Error(
        page > 1 ? "翻页失败，请稍后重试" : "投稿列表获取失败，请稍后重试",
      )
    );
  }

  private async fetchUpName(mid: number): Promise<string> {
    const res = await this.client.get("/x/web-interface/card", {
      params: { mid: String(mid), photo: 0 },
      headers: { Referer: `https://space.bilibili.com/${mid}` },
      validateStatus: () => true,
      timeout: 8000,
    });
    if (res.data?.code !== 0) return "";
    const card = res.data?.data?.card as { name?: string } | undefined;
    return String(card?.name ?? "").trim();
  }

  /** APP 空间投稿分页（TV 签名），作为 web wbi 失败时的稳定兜底 */
  private async fetchAppSpaceArchive(
    mid: number,
    page: number,
    order: UpVideosOrder = "pubdate",
  ): Promise<UpVideosPage> {
    await this.waitSpaceArcGate();
    const pageSize = 30;
    const params = this.buildTvSignedParams({
      vmid: mid,
      pn: Math.max(1, page),
      ps: pageSize,
      order: order === "click" ? "click" : "pubdate",
    });

    const urls = [
      "https://app.bilibili.com/x/v2/space/archive",
      "https://app.biliapi.com/x/v2/space/archive",
    ];

    let lastError: Error | null = null;
    for (const url of urls) {
      const res = await axios.get(url, {
        params,
        headers: {
          ...defaultHeaders(),
          Cookie: getCookieString(),
          Referer: `https://space.bilibili.com/${mid}/video`,
        },
        validateStatus: () => true,
        timeout: 12000,
      });

      if (res.data?.code === 0 && res.data?.data) {
        const payload = res.data.data as Record<string, unknown>;
        const rawItems = (payload.item ?? payload.list ?? []) as Record<
          string,
          unknown
        >[];
        const videos = rawItems
          .map((item) => this.normalizeCursorSpaceVideo(item, mid))
          .filter((item): item is VideoItem => item != null);
        const total = Number(payload.count ?? videos.length) || 0;
        return {
          videos,
          page: Math.max(1, page),
          total,
          hasMore: videos.length >= pageSize || page * pageSize < total,
        };
      }

      lastError = new Error(
        this.formatUserSpaceApiError(
          res.data?.code,
          res.data?.message,
          "投稿列表获取失败，请稍后重试",
        ),
      );
    }

    throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
  }

  async searchVideos(
    keyword: string,
    page = 1,
    order: SearchOrder = "totalrank",
    apiStartPage = 1,
    pageSize = 30,
  ): Promise<SearchVideosPage> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { videos: [], page: 1, hasMore: false, total: 0, nextApiPage: 1 };
    }

    await this.ensureBuvid3();

    const targetSize = Math.max(1, pageSize);
    const videos: VideoItem[] = [];
    const seen = new Set<string>();
    let apiPage = Math.max(1, apiStartPage);
    let total = 0;
    let apiHasMore = true;
    let scans = 0;
    // 相关性过滤后可能空页；限制扫描次数，避免一次搜索打上百次接口卡住转圈
    const maxScans = Math.min(6, Math.max(2, Math.ceil(targetSize / 10) + 2));
    let emptyFilteredStreak = 0;

    while (videos.length < targetSize && apiHasMore && scans < maxScans) {
      const batch = await this.fetchSearchApiPage(trimmed, apiPage, order);
      scans += 1;
      if (apiPage === apiStartPage && total === 0) {
        total = batch.total;
      }
      apiHasMore = batch.hasMore;

      if (batch.videos.length === 0) {
        emptyFilteredStreak += 1;
        // 连续空页基本说明关键词匹配极少，及时停止
        if (!apiHasMore || emptyFilteredStreak >= 2) break;
        apiPage += 1;
        continue;
      }

      emptyFilteredStreak = 0;
      for (const video of batch.videos) {
        if (seen.has(video.bvid)) continue;
        seen.add(video.bvid);
        videos.push(video);
        if (videos.length >= targetSize) break;
      }

      apiPage += 1;
    }

    return {
      videos,
      page,
      hasMore: apiHasMore && videos.length >= targetSize,
      total,
      nextApiPage: apiPage,
    };
  }

  async searchArticles(
    keyword: string,
    page = 1,
    order: SearchArticleOrder = "totalrank",
  ): Promise<SearchArticlesPage> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { articles: [], page: 1, hasMore: false, total: 0 };
    }

    await this.ensureBuvid3();

    const apiPageSize = 20;
    // 部分排序在专栏接口会直接空结果（如 pubdate）；失败时回退综合排序
    const orderCandidates: SearchArticleOrder[] =
      order === "totalrank" ? ["totalrank"] : [order, "totalrank"];

    let lastError = "搜索专栏失败";
    for (const tryOrder of orderCandidates) {
      const baseParams: Record<string, string | number> = {
        search_type: "article",
        keyword: trimmed,
        page,
        page_size: apiPageSize,
        order: tryOrder,
        platform: "pc",
      };

      // 先走 wbi，再降级普通 type 接口（登录态下偶发 wbi 空包）
      const attempts: Array<"wbi" | "plain"> = ["wbi", "plain"];
      for (const mode of attempts) {
        try {
          const params =
            mode === "wbi" ? await signParams(baseParams) : baseParams;
          const url =
            mode === "wbi"
              ? "/x/web-interface/wbi/search/type"
              : "/x/web-interface/search/type";
          const res = await this.client.get(url, {
            params,
            headers: { Referer: "https://search.bilibili.com/" },
            validateStatus: () => true,
          });

          if (res.status === 412 || res.data?.code === -412) {
            lastError = "请求被 B 站安全策略拦截，请稍后重试";
            continue;
          }
          if (res.data?.code !== 0) {
            lastError = String(res.data?.message ?? lastError);
            continue;
          }

          const data = res.data?.data as Record<string, unknown> | undefined;
          const rawResults = Array.isArray(data?.result)
            ? (data.result as Record<string, unknown>[])
            : [];
          const total = Number(data?.numResults ?? rawResults.length) || 0;
          const articles = rawResults
            .map((item) => this.normalizeSearchArticle(item))
            .filter((item): item is SearchArticleItem => item != null);

          // 有统计但本页解析为空时，继续尝试降级；都失败再返回空
          if (articles.length === 0 && total > 0 && rawResults.length > 0) {
            lastError = "专栏结果解析失败";
            continue;
          }
          if (
            articles.length === 0 &&
            total === 0 &&
            tryOrder !== "totalrank"
          ) {
            // 当前排序无结果，试下一个 order
            break;
          }

          return {
            articles,
            page,
            hasMore: rawResults.length > 0 && page * apiPageSize < total,
            total: Math.max(total, articles.length),
          };
        } catch (err) {
          lastError = err instanceof Error ? err.message : lastError;
        }
      }
    }

    throw new Error(lastError);
  }

  async searchUsers(
    keyword: string,
    page = 1,
    order: SearchUserOrder = "default",
    userType: SearchUserTypeFilter = 0,
  ): Promise<SearchUsersPage> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { users: [], page: 1, hasMore: false, total: 0 };
    }

    await this.ensureBuvid3();

    let apiOrder: string | number = 0;
    let orderSort = 0;
    if (order === "fans_desc") {
      apiOrder = "fans";
      orderSort = 0;
    } else if (order === "fans_asc") {
      apiOrder = "fans";
      orderSort = 1;
    } else if (order === "level_desc") {
      apiOrder = "level";
      orderSort = 0;
    } else if (order === "level_asc") {
      apiOrder = "level";
      orderSort = 1;
    }

    const apiPageSize = 20;
    const params = await signParams({
      search_type: "bili_user",
      keyword: trimmed,
      page,
      page_size: apiPageSize,
      order: apiOrder,
      order_sort: orderSort,
      user_type: userType,
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
      throw new Error((res.data?.message as string) || "搜索用户失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawResults =
      (data?.result as Record<string, unknown>[] | undefined) ?? [];
    const total = Number(data?.numResults ?? rawResults.length) || 0;
    const users = rawResults
      .map((item) => this.normalizeSearchUser(item))
      .filter((item): item is SearchUserItem => item != null);

    return {
      users,
      page,
      hasMore: rawResults.length > 0 && page * apiPageSize < total,
      total,
    };
  }

  async getSearchTypeCounts(keyword: string): Promise<SearchTypeCounts> {
    const empty: SearchTypeCounts = {
      video: 0,
      bangumi: 0,
      media: 0,
      live: 0,
      article: 0,
      user: 0,
    };
    const trimmed = keyword.trim();
    if (!trimmed) return empty;

    await this.ensureBuvid3();
    const params = await signParams({
      keyword: trimmed,
      page: 1,
      page_size: 20,
      platform: "pc",
      single_column: 0,
      source: "",
    });

    const res = await this.client.get("/x/web-interface/wbi/search/all/v2", {
      params,
      headers: { Referer: "https://search.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412 || res.data?.code !== 0) {
      return empty;
    }

    const pageinfo = (res.data?.data as Record<string, unknown> | undefined)
      ?.pageinfo as Record<string, Record<string, unknown>> | undefined;
    if (!pageinfo) return empty;

    const countOf = (...keys: string[]) => {
      for (const key of keys) {
        const block = pageinfo[key];
        if (!block) continue;
        const n = Number(block.numResults ?? block.total ?? 0);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return 0;
    };

    return {
      video: countOf("video"),
      bangumi: countOf("media_bangumi", "pgc"),
      media: countOf("media_ft"),
      live: countOf("live_room", "live"),
      article: countOf("article"),
      user: countOf("bili_user", "user"),
    };
  }

  private normalizeSearchUser(
    item: Record<string, unknown>,
  ): SearchUserItem | null {
    const mid = Number(item.mid);
    if (!Number.isFinite(mid) || mid <= 0) return null;

    const official = (item.official_verify ?? {}) as Record<string, unknown>;
    const roomId = Number(item.room_id);
    return {
      mid,
      name: this.stripHtml(String(item.uname ?? "")),
      face: this.normalizeHttps(String(item.upic ?? "")),
      sign: this.stripHtml(String(item.usign ?? "")),
      fans: Number(item.fans ?? 0) || 0,
      videos: Number(item.videos ?? 0) || 0,
      level: Number(item.level ?? 0) || 0,
      isUp: Number(item.is_upuser ?? 0) === 1,
      isLive: Number(item.is_live ?? 0) === 1,
      roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : undefined,
      officialDesc: String(official.desc ?? "") || undefined,
      isFollowing: false,
    };
  }

  private normalizeSearchArticle(
    item: Record<string, unknown>,
  ): SearchArticleItem | null {
    const id = Number(item.id);
    if (!Number.isFinite(id) || id <= 0) return null;

    const images = Array.isArray(item.image_urls)
      ? (item.image_urls as unknown[])
          .map((url) => this.normalizeHttps(String(url ?? "")))
          .filter(Boolean)
      : [];

    return {
      id,
      title: this.stripHtml(String(item.title ?? "未命名专栏")),
      desc: this.stripHtml(String(item.desc ?? "")),
      cover: images[0] || "",
      covers: images,
      mid: Number(item.mid ?? 0) || 0,
      author: this.stripHtml(
        String(item.author ?? item.uname ?? item.name ?? ""),
      ),
      view: Number(item.view ?? 0) || 0,
      like: Number(item.like ?? 0) || 0,
      reply: Number(item.reply ?? 0) || 0,
      pubTime: Number(item.pub_time ?? 0) || 0,
      categoryName: String(item.category_name ?? "") || undefined,
      url: `https://www.bilibili.com/read/cv${id}`,
    };
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  }

  private async fetchSearchApiPage(
    keyword: string,
    page: number,
    order: SearchOrder,
  ): Promise<SearchVideosPage> {
    const apiPageSize = 20;
    const params = await signParams({
      search_type: "video",
      keyword,
      page,
      page_size: apiPageSize,
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
    const rawResults =
      (data?.result as Record<string, unknown>[] | undefined) ?? [];
    const results = rawResults
      .filter((item) => this.isSearchVideoResult(item))
      .filter((item) => this.isSearchResultRelevant(item, keyword));
    const total = (data?.numResults as number) ?? rawResults.length;
    const videos = results.map((item) => this.normalizeSearchVideo(item));
    const fetchedCount = rawResults.length;

    return {
      videos,
      page,
      hasMore: fetchedCount > 0 && page * apiPageSize < total,
      total,
    };
  }

  private async fetchSpaceArcList(
    mid: number,
    page: number,
    order: UpVideosOrder = "pubdate",
  ): Promise<UpVideosPage> {
    const referer = `https://space.bilibili.com/${mid}/video`;
    const pageSize = 30;
    const baseParams: Record<string, string | number> = {
      mid: String(mid),
      pn: page,
      ps: pageSize,
      tid: 0,
      keyword: "",
      order,
      platform: "web",
      web_location: "1550101",
      order_avoided: "true",
    };

    // wbi 优先：plain 翻页极易 -403
    const modes: Array<"wbi" | "plain"> = ["wbi", "plain"];
    let lastError: Error | null = null;

    for (const mode of modes) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await this.waitSpaceArcGate();

        let params: Record<string, string | number> = baseParams;
        if (mode === "wbi") {
          try {
            params = await signParams(baseParams);
          } catch (err) {
            lastError =
              err instanceof Error
                ? err
                : new Error("投稿接口签名失败，请稍后重试");
            break;
          }
        }

        const url =
          mode === "wbi" ? "/x/space/wbi/arc/search" : "/x/space/arc/search";

        const res = await this.client.get(url, {
          params,
          headers: { Referer: referer },
          validateStatus: () => true,
          timeout: 10000,
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
          const total = Number(pageInfo?.count ?? vlist.length) || 0;
          const ps = Number(pageInfo?.ps ?? pageSize) || pageSize;
          // 翻页空包（常见于风控软失败）不要当成功，交给后续通道
          if (page > 1 && vlist.length === 0 && total > (page - 1) * ps) {
            lastError = new Error("投稿翻页返回空数据，正在尝试其它通道");
            break;
          }
          return {
            videos: vlist.map((item) => this.normalizeSpaceVideo(item, mid)),
            page,
            total,
            hasMore: vlist.length >= ps || page * ps < total,
          };
        }

        const retryable =
          code === -799 ||
          code === -412 ||
          res.status === 412 ||
          (mode === "wbi" &&
            (code === -400 ||
              String(payload?.message ?? "").includes("请求错误")));
        if (retryable && attempt < 2) {
          if (mode === "wbi") invalidateWbiCache();
          await sleep(code === -799 ? 1600 : mode === "wbi" ? 700 : 500);
          continue;
        }

        if (code === -799) {
          lastError = new Error("请求过于频繁，请稍后再试");
          break;
        }
        if (code === -352) {
          lastError = new Error("投稿接口触发风控，请稍后重试或重新登录");
          break;
        }
        if (code === -412 || res.status === 412) {
          lastError = new Error("请求被 B 站安全策略拦截，请稍后重试");
          break;
        }

        lastError = new Error(
          this.formatUserSpaceApiError(
            code,
            payload?.message,
            "投稿列表获取失败，请稍后重试",
          ),
        );
        break;
      }
    }

    throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
  }

  /** UP 投稿游标缓存：支持页码跳转时按链拉取 */
  private upVideoCursorCache = new Map<
    string,
    {
      total: number;
      pages: Map<number, VideoItem[]>;
      hasNext: Map<number, boolean>;
      lastAid: Map<number, number>;
    }
  >();

  private async fetchSpaceArchiveCursor(
    mid: number,
    page: number,
    order: UpVideosOrder = "pubdate",
  ): Promise<UpVideosPage> {
    const pageSize = 30;
    const targetPage = Math.max(1, page);
    const cacheKey = `${mid}:${order}`;

    if (targetPage === 1) {
      this.upVideoCursorCache.delete(cacheKey);
    }

    let cache = this.upVideoCursorCache.get(cacheKey);
    if (!cache) {
      cache = {
        total: 0,
        pages: new Map(),
        hasNext: new Map(),
        lastAid: new Map(),
      };
      this.upVideoCursorCache.set(cacheKey, cache);
    }

    for (let p = 1; p <= targetPage; p++) {
      if (cache.pages.has(p)) continue;

      if (p > 1 && !cache.lastAid.has(p - 1)) {
        throw new Error("翻页状态失效，请回到第 1 页后重试");
      }

      await this.waitSpaceArcGate();

      const params: Record<string, string | number> = {
        vmid: String(mid),
        ps: pageSize,
        order,
        platform: "web",
        mobi_app: "web",
      };
      if (p > 1) {
        params.aid = cache.lastAid.get(p - 1)!;
      }

      const hosts = [
        "https://app.bilibili.com/x/v2/space/archive/cursor",
        "https://app.biliapi.com/x/v2/space/archive/cursor",
      ];

      let payload: Record<string, unknown> | null = null;
      let lastError: Error | null = null;

      for (const url of hosts) {
        const res = await axios.get(url, {
          params,
          headers: {
            ...defaultHeaders(),
            Cookie: getCookieString(),
            Referer: `https://space.bilibili.com/${mid}/video`,
            Origin: "https://space.bilibili.com",
          },
          validateStatus: () => true,
          timeout: 12000,
        });

        if (res.data?.code === 0 && res.data?.data) {
          payload = res.data.data as Record<string, unknown>;
          break;
        }

        lastError = new Error(
          this.formatUserSpaceApiError(
            res.data?.code,
            res.data?.message,
            "投稿列表获取失败，请稍后重试",
          ),
        );
      }

      if (!payload) {
        throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
      }

      const rawItems = (payload.item ?? []) as Record<string, unknown>[];
      const videos = rawItems
        .map((item) => this.normalizeCursorSpaceVideo(item, mid))
        .filter((item): item is VideoItem => item != null);

      const total = Number(payload.count ?? cache.total) || cache.total || 0;
      const hasNext = Boolean(payload.has_next);

      cache.total = total;
      cache.pages.set(p, videos);
      cache.hasNext.set(p, hasNext);

      const last = videos[videos.length - 1];
      if (last?.aid) {
        cache.lastAid.set(p, last.aid);
      } else if (hasNext) {
        // 没有 aid 无法继续翻
        cache.hasNext.set(p, false);
      }
    }

    const videos = cache.pages.get(targetPage) ?? [];
    const hasMore =
      cache.hasNext.get(targetPage) ??
      (cache.total > 0 && targetPage * pageSize < cache.total);

    return {
      videos,
      page: targetPage,
      total: cache.total,
      hasMore: Boolean(hasMore) && videos.length > 0,
    };
  }

  private normalizeCursorSpaceVideo(
    item: Record<string, unknown>,
    mid: number,
  ): VideoItem | null {
    const bvid = String(item.bvid ?? "");
    if (!bvid) return null;
    // 课堂等非普通投稿没有可靠 bvid 播放链路，跳过
    if (item.goto && String(item.goto) !== "av") return null;

    const aid = Number(item.param ?? item.aid ?? 0) || 0;
    const durationRaw = item.duration ?? item.length;
    const duration =
      typeof durationRaw === "string"
        ? this.parseSpaceDuration(durationRaw)
        : Number(durationRaw ?? 0) || 0;

    return {
      bvid,
      aid,
      title: String(item.title ?? ""),
      cover: this.normalizeVideoCoverUrl(String(item.cover ?? item.pic ?? "")),
      duration,
      play: Number(item.play ?? 0) || 0,
      danmaku: Number(item.danmaku ?? item.video_review ?? 0) || 0,
      owner: {
        mid,
        name: String(item.author ?? ""),
        face: "",
      },
      pubdate: Number(item.ctime ?? item.created ?? item.pubdate ?? 0) || 0,
    };
  }

  private formatUserSpaceApiError(
    code: unknown,
    message: unknown,
    fallback: string,
  ): string {
    const text =
      typeof message === "string" && message.trim() ? message.trim() : "";
    const numericCode = typeof code === "number" ? code : Number(code);

    if (
      numericCode === -404 ||
      text.includes("啥都木有") ||
      text.includes("用户不存在") ||
      text.includes("账号已注销") ||
      text.includes("用户已注销")
    ) {
      return "该用户不存在或账号已注销";
    }

    if (
      text.includes("隐私") ||
      text.includes("不可见") ||
      (numericCode === -403 &&
        (text.includes("隐私") ||
          text.includes("不可见") ||
          text.includes("隐藏")))
    ) {
      return "该用户已设置隐私，无法查看主页内容";
    }

    if (numericCode === -403) {
      return text
        ? `投稿列表暂时无法访问：${text}`
        : "投稿列表暂时无法访问，请稍后重试或重新登录";
    }

    if (text) {
      return fallback.includes("获取失败") && !text.includes("获取失败")
        ? `${fallback.replace(/，请稍后重试$/, "")}：${text}`
        : text;
    }

    if (Number.isFinite(numericCode) && numericCode !== 0) {
      return `${fallback}（错误码 ${numericCode}）`;
    }

    return fallback;
  }

  private spaceArcGate: Promise<void> = Promise.resolve();
  private lastSpaceArcAt = 0;

  /** 串行化空间投稿请求，避免短时间并发触发 -799 */
  private waitSpaceArcGate(): Promise<void> {
    const minIntervalMs = 650;
    const run = this.spaceArcGate.then(async () => {
      const wait = Math.max(
        0,
        minIntervalMs - (Date.now() - this.lastSpaceArcAt),
      );
      if (wait > 0) await sleep(wait);
      this.lastSpaceArcAt = Date.now();
    });
    this.spaceArcGate = run.catch(() => undefined);
    return run;
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
    order: UpVideosOrder = "pubdate",
  ): Promise<UpVideosPage> {
    return this.fetchUpVideosBySearchPaged(mid, upName, page, order, 0);
  }

  /** 搜索结果按 mid 过滤后的投稿缓存（空间接口翻页失败时使用） */
  private upSearchVideoCache = new Map<
    string,
    {
      videos: VideoItem[];
      searchPage: number;
      searchTotal: number;
      exhausted: boolean;
    }
  >();

  private async fetchUpVideosBySearchPaged(
    mid: number,
    upName: string,
    page: number,
    order: UpVideosOrder = "pubdate",
    knownTotal = 0,
  ): Promise<UpVideosPage> {
    if (!upName.trim()) {
      return { videos: [], page, hasMore: false, total: 0 };
    }

    // B 站搜索单页通常最多约 20 条，不能用 30 判断是否到底
    const apiPageSize = 20;
    const pageSize = 30;
    const targetPage = Math.max(1, page);
    const cacheKey = `${mid}:${order}:${upName}`;

    if (targetPage === 1) {
      this.upSearchVideoCache.delete(cacheKey);
    }

    let cache = this.upSearchVideoCache.get(cacheKey);
    if (!cache) {
      cache = {
        videos: [],
        searchPage: 1,
        searchTotal: 0,
        exhausted: false,
      };
      this.upSearchVideoCache.set(cacheKey, cache);
    }

    const needed = targetPage * pageSize;
    let emptyStreak = 0;
    const maxScans = Math.min(25, Math.max(8, targetPage * 6));

    while (
      cache.videos.length < needed &&
      !cache.exhausted &&
      cache.searchPage <= maxScans
    ) {
      const params = await signParams({
        search_type: "video",
        keyword: upName,
        page: cache.searchPage,
        page_size: apiPageSize,
        order,
        platform: "pc",
        single_column: 0,
        source: "",
      });

      const res = await this.client.get("/x/web-interface/wbi/search/type", {
        params,
        headers: { Referer: "https://search.bilibili.com/" },
        validateStatus: () => true,
        timeout: 10000,
      });

      if (res.data?.code !== 0) {
        // 搜索也被拦时抛错，让上层展示真实原因，而不是落到「请求错误」
        throw new Error(
          String(res.data?.message ?? "") || "搜索投稿失败，请稍后重试",
        );
      }

      const data = res.data?.data as Record<string, unknown> | undefined;
      const results = (data?.result ?? []) as Record<string, unknown>[];
      if (!cache.searchTotal) {
        cache.searchTotal = Number(data?.numResults ?? 0) || 0;
      }

      const seen = new Set(cache.videos.map((v) => v.bvid));
      let added = 0;
      for (const item of results) {
        const itemMid = Number(item.mid ?? item.userid ?? 0);
        if (!itemMid || itemMid !== Number(mid)) continue;
        const video = this.normalizeSearchVideo(item);
        if (!video.bvid || seen.has(video.bvid)) continue;
        seen.add(video.bvid);
        cache.videos.push(video);
        added += 1;
      }

      if (results.length === 0) {
        cache.exhausted = true;
      } else if (
        cache.searchTotal > 0 &&
        cache.searchPage * apiPageSize >= cache.searchTotal
      ) {
        cache.exhausted = true;
      } else if (results.length < apiPageSize) {
        cache.exhausted = true;
      } else if (added === 0) {
        emptyStreak += 1;
        if (emptyStreak >= 4) cache.exhausted = true;
      } else {
        emptyStreak = 0;
      }

      cache.searchPage += 1;
    }

    const start = (targetPage - 1) * pageSize;
    const videos = cache.videos.slice(start, start + pageSize);
    const total = Math.max(knownTotal, cache.videos.length);
    const hasMore =
      cache.videos.length > start + videos.length ||
      (!cache.exhausted && videos.length >= pageSize) ||
      (total > 0 && start + videos.length < total && videos.length > 0);

    return {
      videos,
      page: targetPage,
      total,
      hasMore: Boolean(hasMore),
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
      duration: this.parseSpaceDuration(item.length),
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

  private parseSpaceDuration(length: unknown): number {
    if (typeof length === "number" && Number.isFinite(length)) {
      return Math.max(0, Math.floor(length));
    }
    if (typeof length !== "string") return 0;
    const parts = length
      .split(":")
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n));
    if (parts.length === 0) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
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

  private isToViewFullMessage(message: string): boolean {
    const text = message.toLowerCase();
    return (
      text.includes("列表已满") ||
      text.includes("稍后再看已满") ||
      (text.includes("1000") &&
        (text.includes("满") || text.includes("上限") || text.includes("最多")))
    );
  }

  private assertToViewMutationResponse(
    res: AxiosResponse,
    fallback: string,
  ): void {
    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }

    const code = Number(res.data?.code);
    const message = String(res.data?.message ?? "");

    if (code === 90001 || this.isToViewFullMessage(message)) {
      throw new Error("TOVIEW_FULL");
    }
    if (code === 90003) {
      throw new Error("该视频已被删除，无法添加");
    }
    if (code === 0) return;

    throw new Error(message || fallback);
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
      updateBaseline: (data?.update_baseline as string) ?? "",
      updateNum: Number(data?.update_num) || 0,
    };
  }

  /** 关注动态流（官方「动态」页） */
  async getFollowDynamics(
    offset = "",
    type: "all" | "video" | "article" = "all",
  ): Promise<SpaceDynamicPage> {
    if (!isLoggedIn()) {
      throw new Error("请先登录后查看关注动态");
    }

    await this.ensureBuvid3();

    const params: Record<string, string | number> = {
      type,
      timezone_offset: -480,
      platform: "web",
      web_location: "333.1365",
      features:
        "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard",
    };
    if (offset) params.offset = offset;

    const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/all", {
      params,
      headers: { Referer: "https://t.bilibili.com/" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "关注动态获取失败");
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
      updateBaseline: (data?.update_baseline as string) ?? "",
      updateNum: Number(data?.update_num) || 0,
    };
  }

  /** 官方历史记录（与客户端历史同步） */
  async getWatchHistory(
    type: HistoryFeedType = "all",
    cursor?: HistoryCursor,
  ): Promise<HistoryPage> {
    if (!isLoggedIn()) {
      throw new Error("请先登录后查看历史记录");
    }

    await this.ensureBuvid3();

    const params: Record<string, string | number> = {
      ps: 20,
      type,
    };
    if (cursor?.max) params.max = cursor.max;
    if (cursor?.viewAt) params.view_at = cursor.viewAt;
    if (cursor?.business) params.business = cursor.business;

    const res = await this.client.get("/x/web-interface/history/cursor", {
      params,
      headers: { Referer: "https://www.bilibili.com/account/history" },
      validateStatus: () => true,
    });

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "历史记录获取失败");
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawList = (data?.list as Record<string, unknown>[] | undefined) ?? [];
    const items = rawList
      .map((item) => this.normalizeHistoryItem(item))
      .filter((item): item is HistoryItem => item != null);

    const next = (data?.cursor as Record<string, unknown> | undefined) ?? {};
    const nextCursor: HistoryCursor = {
      max: Number(next.max) || 0,
      viewAt: Number(next.view_at) || 0,
      business: String(next.business ?? ""),
    };

    return {
      items,
      cursor: nextCursor,
      hasMore: items.length > 0 && nextCursor.max > 0 && nextCursor.viewAt > 0,
    };
  }

  /** 删除单条历史：kid 格式为 `{business}_{oid}` */
  async deleteWatchHistory(item: {
    business: string;
    oid: number;
    kid?: number;
  }): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再删除历史");

    const business = item.business || "archive";
    const targetId = item.oid || item.kid || 0;
    if (!targetId) throw new Error("无效的历史记录");

    const res = await this.client.post(
      "/x/v2/history/delete",
      new URLSearchParams({
        kid: `${business}_${targetId}`,
        csrf,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://www.bilibili.com/account/history",
          Origin: "https://www.bilibili.com",
        },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "删除历史失败");
    }
  }

  /** 清空全部历史记录 */
  async clearWatchHistory(): Promise<void> {
    const csrf = getCsrf();
    if (!csrf) throw new Error("请先登录后再清空历史");

    const res = await this.client.post(
      "/x/v2/history/clear",
      new URLSearchParams({ csrf }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://www.bilibili.com/account/history",
          Origin: "https://www.bilibili.com",
        },
        validateStatus: () => true,
      },
    );

    if (res.status === 412 || res.data?.code === -412) {
      throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (res.data?.code !== 0) {
      throw new Error((res.data?.message as string) || "清空历史失败");
    }
  }

  private normalizeHistoryItem(
    item: Record<string, unknown>,
  ): HistoryItem | null {
    const history = (item.history ?? {}) as Record<string, unknown>;
    const business = String(history.business ?? item.business ?? "");
    const oid = Number(history.oid) || 0;
    const kid = Number(item.kid) || oid;
    const bvid = (history.bvid as string) || undefined;
    const viewAt = Number(item.view_at) || 0;
    const title = String(item.title ?? "");
    if (!title && !bvid && !oid) return null;

    const coversRaw = item.covers as string[] | null | undefined;
    const covers = Array.isArray(coversRaw)
      ? coversRaw
          .map((url) => String(url || "").replace(/^http:/, "https:"))
          .filter(Boolean)
      : undefined;

    return {
      id: `${business || "item"}-${kid || oid}-${viewAt}`,
      kid,
      title: title || "未命名内容",
      cover: this.normalizeBfsUrl(String(item.cover ?? covers?.[0] ?? "")),
      covers,
      authorName: String(item.author_name ?? ""),
      authorFace: this.normalizeBfsUrl(String(item.author_face ?? "")),
      authorMid: Number(item.author_mid) || 0,
      viewAt,
      progress: Number(item.progress) || 0,
      duration: Number(item.duration) || 0,
      showTitle: (item.show_title as string) || undefined,
      badge: (item.badge as string) || undefined,
      tagName: (item.tag_name as string) || undefined,
      liveStatus:
        item.live_status == null ? undefined : Number(item.live_status),
      business,
      bvid,
      oid,
      cid: Number(history.cid) || undefined,
      uri: (item.uri as string) || undefined,
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

  async getCheeseFollowList(page = 1, mid?: number): Promise<CheeseCoursePage> {
    await this.ensureBuvid3();
    const pageSize = 20;
    const user = this.getAuthStatus();
    const targetMid = mid ?? user.mid ?? 0;

    if (!isLoggedIn() || targetMid <= 0) {
      return { list: [], page, hasMore: false, total: 0 };
    }

    const merged = new Map<number, CheeseCourseItem>();
    let paidTotal = 0;
    let paidHasMore = false;

    if (page === 1) {
      const paid = await this.fetchCheesePaidList(1, pageSize);
      paidTotal = paid.total;
      paidHasMore = paid.hasMore;
      for (const item of paid.list) merged.set(item.seasonId, item);
    }

    const favorite = await this.fetchCheeseFavoriteList(
      targetMid,
      page,
      pageSize,
    );
    for (const item of favorite.list) merged.set(item.seasonId, item);

    const total = paidTotal + favorite.total;
    const hasMore = favorite.hasMore || (page === 1 && paidHasMore);

    return {
      list: [...merged.values()],
      page,
      hasMore,
      total: total || merged.size,
    };
  }

  private async fetchCheesePaidList(
    page: number,
    pageSize: number,
  ): Promise<{ list: CheeseCourseItem[]; total: number; hasMore: boolean }> {
    const res = await this.client.get("/pugv/pay/web/my/paid", {
      params: { pn: page, ps: pageSize },
      headers: { Referer: "https://www.bilibili.com/cheese/mine/list" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      return { list: [], total: 0, hasMore: false };
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawList = Array.isArray(data?.data) ? data.data : [];
    const list = rawList
      .map((item) => this.normalizeCheeseCourseItem(item))
      .filter((item): item is CheeseCourseItem => item != null);

    const total = Number(data?.total ?? list.length) || list.length;
    const hasMore = data?.next === true || page * pageSize < total;

    return { list, total, hasMore };
  }

  private async fetchCheeseFavoriteList(
    mid: number,
    page: number,
    pageSize: number,
  ): Promise<{ list: CheeseCourseItem[]; total: number; hasMore: boolean }> {
    const res = await this.client.get("/pugv/app/web/favorite/page", {
      params: { mid, pn: page, ps: pageSize },
      headers: { Referer: "https://www.bilibili.com/cheese/" },
      validateStatus: () => true,
    });

    if (res.data?.code !== 0) {
      return { list: [], total: 0, hasMore: false };
    }

    const data = res.data?.data as Record<string, unknown> | undefined;
    const rawList = Array.isArray(data?.items) ? data.items : [];
    const list = rawList
      .map((item) => this.normalizeCheeseCourseItem(item))
      .filter((item): item is CheeseCourseItem => item != null);

    const pageInfo = (data?.page as Record<string, unknown> | undefined) ?? {};
    const total = Number(pageInfo.total ?? list.length) || list.length;
    const hasMore = pageInfo.next === true || page * pageSize < total;

    return { list, total, hasMore };
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
    if (!item || typeof item !== "object") return null;

    const raw = item as Record<string, unknown>;
    const season =
      (raw.season as Record<string, unknown> | undefined) ??
      (raw.season_info as Record<string, unknown> | undefined) ??
      (raw.course as Record<string, unknown> | undefined) ??
      raw;

    const seasonId = Number(
      season.season_id ?? raw.season_id ?? season.id ?? raw.id ?? raw.ssid,
    );
    if (!seasonId) return null;

    const coverRaw = season.cover ?? raw.cover ?? season.cover_url ?? raw.pic;
    let cover = "";
    if (typeof coverRaw === "string") {
      cover = coverRaw;
    } else if (coverRaw && typeof coverRaw === "object") {
      cover = ((coverRaw as { url?: string }).url as string) ?? "";
    }

    const link = String(season.link ?? raw.link ?? raw.url ?? "");
    const url = link.startsWith("http")
      ? link
      : `https://www.bilibili.com/cheese/play/ss${seasonId}`;

    const statusRaw = season.status ?? raw.status ?? raw.update_info ?? "";
    const status =
      typeof statusRaw === "string" || typeof statusRaw === "number"
        ? String(statusRaw)
        : "";

    return {
      seasonId,
      title: String(season.title ?? raw.title ?? "未命名课程"),
      cover: this.normalizeBfsUrl(cover),
      subtitle: String(season.subtitle ?? raw.subtitle ?? raw.sub_title ?? ""),
      epCount:
        Number(
          season.ep_count ??
            raw.ep_count ??
            season.episode_count ??
            raw.episode_count,
        ) || 0,
      playCount:
        Number(season.play ?? raw.play ?? season.view ?? raw.view) || 0,
      status,
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
    const pubTime = (moduleAuthor?.pub_ts as number) ?? 0;
    const pubTimeLabel =
      typeof moduleAuthor?.pub_time === "string"
        ? moduleAuthor.pub_time
        : this.formatDynamicPubTime(pubTime);
    const authorMid = Number(moduleAuthor?.mid) || 0;
    const authorName = (moduleAuthor?.name as string) ?? "";
    const authorFace = ((moduleAuthor?.face as string) ?? "").replace(
      /^http:/,
      "https:",
    );
    const pubAction =
      (moduleAuthor?.pub_action as string) ||
      (moduleAuthor?.pub_label as string) ||
      this.getDynamicPubAction(type);

    const moduleDynamic = modules?.module_dynamic as
      | Record<string, unknown>
      | undefined;
    const major = moduleDynamic?.major as Record<string, unknown> | undefined;
    const moduleStat = modules?.module_stat as
      | Record<string, unknown>
      | undefined;
    const likeCount =
      Number((moduleStat?.like as Record<string, unknown>)?.count) || 0;
    const replyCount =
      Number((moduleStat?.comment as Record<string, unknown>)?.count) || 0;

    const base = {
      id,
      type,
      pubTime,
      pubTimeLabel,
      pubAction,
      authorMid: authorMid || undefined,
      authorName,
      authorFace,
    };

    if (major?.archive) {
      const archive = major.archive as Record<string, unknown>;
      const stat = archive.stat as Record<string, unknown> | undefined;
      const durationRaw = archive.duration ?? archive.duration_text;
      return {
        ...base,
        kind: "video",
        text: "",
        title: (archive.title as string) ?? "",
        bvid: archive.bvid as string | undefined,
        cover: ((archive.cover as string) ?? "").replace(/^http:/, "https:"),
        duration: this.parseDynamicDuration(durationRaw),
        stats: {
          view: Number(stat?.play) || 0,
          danmaku: Number(stat?.danmaku) || 0,
          like: Number(stat?.like) || likeCount,
          reply: Number(stat?.reply) || replyCount,
        },
      };
    }

    const liveInfo = this.extractLiveDynamic(major, type);
    if (liveInfo) {
      return {
        ...base,
        kind: "live",
        text: liveInfo.text,
        title: liveInfo.title,
        cover: liveInfo.cover,
        liveRoomId: liveInfo.roomId,
        liveUrl: liveInfo.url,
        liveState: liveInfo.state,
        stats: { like: likeCount, reply: replyCount },
      };
    }

    if (major?.opus) {
      const opus = major.opus as Record<string, unknown>;
      const summary = this.extractRichText(opus.summary);
      const pics = (opus.pics as Record<string, unknown>[] | undefined) ?? [];
      const images = pics
        .map((pic) =>
          String(pic.url ?? pic.src ?? "").replace(/^http:/, "https:"),
        )
        .filter(Boolean);
      return {
        ...base,
        kind: "opus",
        text: summary,
        title: ((opus.title as string) ?? summary.slice(0, 40)) || "图文动态",
        cover:
          images[0] ||
          ((opus.cover as string) ?? "").replace(/^http:/, "https:"),
        images,
        stats: { like: likeCount, reply: replyCount },
      };
    }

    if (type.includes("FORWARD") || major?.forward) {
      const desc = moduleDynamic?.desc as Record<string, unknown> | undefined;
      const text =
        this.extractRichText(desc) ||
        this.extractRichText(moduleDynamic) ||
        "转发动态";
      return {
        ...base,
        kind: "forward",
        text,
        title: text.slice(0, 80) || "转发动态",
        stats: { like: likeCount, reply: replyCount },
      };
    }

    const desc = moduleDynamic?.desc as Record<string, unknown> | undefined;
    const text =
      this.extractRichText(desc) ||
      this.extractRichText(moduleDynamic) ||
      "动态";

    const coverMajor = major?.draw as Record<string, unknown> | undefined;
    const drawItems = coverMajor?.items as
      | Record<string, unknown>[]
      | undefined;
    const images = (drawItems ?? [])
      .map((entry) =>
        String(entry.src ?? entry.url ?? "").replace(/^http:/, "https:"),
      )
      .filter(Boolean);

    return {
      ...base,
      kind: images.length > 0 ? "draw" : "text",
      text,
      title: text.slice(0, 80) || "动态",
      cover: images[0],
      images,
      stats: { like: likeCount, reply: replyCount },
    };
  }

  private parseDynamicDuration(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value !== "string" || !value.trim()) return 0;
    if (/^\d+$/.test(value.trim())) return Number(value);
    const parts = value
      .split(":")
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n));
    if (parts.length === 0) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  private extractLiveDynamic(
    major: Record<string, unknown> | undefined,
    type: string,
  ): {
    title: string;
    cover: string;
    text: string;
    roomId?: number;
    url?: string;
    state?: number;
  } | null {
    if (!major) return null;

    if (major.live) {
      const live = major.live as Record<string, unknown>;
      return {
        title: (live.title as string) || "正在直播",
        cover: ((live.cover as string) ?? "").replace(/^http:/, "https:"),
        text: (live.desc_first as string) || (live.desc_second as string) || "",
        roomId: Number(live.id ?? live.room_id) || undefined,
        url: (live.jump_url as string) || undefined,
        state: Number(live.live_state) || 1,
      };
    }

    if (major.live_rcmd || type.includes("LIVE")) {
      const liveRcmd = major.live_rcmd as Record<string, unknown> | undefined;
      const contentRaw = liveRcmd?.content;
      let payload: Record<string, unknown> | null = null;
      if (typeof contentRaw === "string" && contentRaw.trim()) {
        try {
          payload = JSON.parse(contentRaw) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      } else if (contentRaw && typeof contentRaw === "object") {
        payload = contentRaw as Record<string, unknown>;
      }

      const playInfo =
        (payload?.live_play_info as Record<string, unknown> | undefined) ??
        payload;
      if (!playInfo) return null;

      return {
        title: (playInfo.title as string) || "正在直播",
        cover: String(playInfo.cover ?? playInfo.cover_from_user ?? "").replace(
          /^http:/,
          "https:",
        ),
        text:
          (playInfo.area_name as string) ||
          (playInfo.parent_area_name as string) ||
          "",
        roomId: Number(playInfo.room_id ?? playInfo.liveid) || undefined,
        url:
          (playInfo.link as string) ||
          (playInfo.live_link as string) ||
          (playInfo.room_id
            ? `https://live.bilibili.com/${playInfo.room_id}`
            : undefined),
        state: Number(playInfo.live_status ?? playInfo.live_state) || 1,
      };
    }

    return null;
  }

  private formatDynamicPubTime(ts: number): string {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${month}月${day}日 ${hour}:${minute}`;
  }

  private getDynamicPubAction(type: string): string {
    if (type.includes("FORWARD")) return "转发了动态";
    if (type.includes("AV")) return "投稿了视频";
    if (type.includes("LIVE")) return "正在直播";
    if (type.includes("DRAW")) return "发布了动态";
    if (type.includes("WORD")) return "发布了动态";
    if (type.includes("ARTICLE")) return "投稿了专栏";
    return "发布了动态";
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
      pubdate: (item.pubdate as number) ?? (item.ctime as number) ?? 0,
      progress: (item.progress as number) ?? 0,
      addAt: (item.add_at as number) ?? 0,
      cid: (item.cid as number) ?? 0,
    };
  }

  private isSearchVideoResult(item: Record<string, unknown>): boolean {
    if (!item.bvid) return false;

    const type = String(item.type ?? item.result_type ?? "video").toLowerCase();
    if (type && type !== "video") return false;

    if (item.is_live === 1 || item.is_live === true) return false;

    return true;
  }

  private isSearchResultRelevant(
    item: Record<string, unknown>,
    keyword: string,
  ): boolean {
    const titleRaw = String(item.title ?? "");
    const tagRaw = String(item.tag ?? "");
    if (
      titleRaw.includes('<em class="keyword">') ||
      tagRaw.includes('<em class="keyword">')
    ) {
      return true;
    }

    const terms = keyword
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);
    if (terms.length === 0) return true;

    const stripHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/<[^>]+>/g, "")
        .toLowerCase();

    const bvid = stripHtml(item.bvid);
    const haystack = [
      item.title,
      item.author,
      item.tag,
      item.description,
      item.arcurl,
    ]
      .map(stripHtml)
      .join(" ");

    return terms.every(
      (term) =>
        haystack.includes(term) ||
        (term.startsWith("bv") && bvid.includes(term)),
    );
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
