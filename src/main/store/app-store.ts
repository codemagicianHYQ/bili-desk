import Store from "electron-store";
import type {
  AbnormalFollowingRecord,
  AiConfig,
  InvalidVideoRecord,
  Theme,
  ToViewItem,
  UpActivityRecord,
  UserInfo,
} from "@shared/types";

interface StoreSchema {
  theme: Theme;
  /** 液态玻璃：启动时就要开透明窗 + Acrylic，不能等渲染进程 */
  windowGlass: boolean;
  /** 与渲染进程 themePreset 同步，避免只改 localStorage 导致启动未开透明 */
  themePreset: string;
  cookies: {
    SESSDATA: string;
    bili_jct: string;
    DedeUserID: string;
    DedeUserID__ckMd5: string;
    buvid3: string;
  };
  user: UserInfo | null;
  ai: AiConfig;
  refreshToken: string;
  accessToken: string;
  localDb: unknown;
  /** 官方稍后再看满员后溢出到本机的列表 */
  localToView: ToViewItem[];
  /** 失效视频归档（收藏 / 稍后再看） */
  invalidVideos: InvalidVideoRecord[];
  /** 关注里被封 / 注销的 UP */
  abnormalFollowings: AbnormalFollowingRecord[];
  /** 仍有效时缓存标题/UP，失效后用来还原展示 */
  videoMetaCache: Record<
    string,
    {
      title: string;
      cover: string;
      upperMid: number;
      upperName: string;
      updatedAt: number;
    }
  >;
  lastIntegrityScanAt: number;
  /** 关注 UP 活跃度（最新稿件 / 动态时间） */
  upActivityCache: UpActivityRecord[];
  lastUpActivityScanAt: number;
}

const defaults: StoreSchema = {
  theme: "dark",
  windowGlass: false,
  themePreset: "rose",
  cookies: {
    SESSDATA: "",
    bili_jct: "",
    DedeUserID: "",
    DedeUserID__ckMd5: "",
    buvid3: "",
  },
  user: null,
  refreshToken: "",
  accessToken: "",
  localDb: null,
  ai: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
  },
  localToView: [],
  invalidVideos: [],
  abnormalFollowings: [],
  videoMetaCache: {},
  lastIntegrityScanAt: 0,
  upActivityCache: [],
  lastUpActivityScanAt: 0,
};

export const appStore = new Store<StoreSchema>({
  name: "bilidesk-config",
  defaults,
});

export function getCookieString(): string {
  const c = appStore.get("cookies");
  const parts: string[] = [];
  if (c.SESSDATA) parts.push(`SESSDATA=${c.SESSDATA}`);
  if (c.bili_jct) parts.push(`bili_jct=${c.bili_jct}`);
  if (c.DedeUserID) parts.push(`DedeUserID=${c.DedeUserID}`);
  if (c.DedeUserID__ckMd5)
    parts.push(`DedeUserID__ckMd5=${c.DedeUserID__ckMd5}`);
  if (c.buvid3) parts.push(`buvid3=${c.buvid3}`);
  return parts.join("; ");
}

export function setCookies(cookies: Partial<StoreSchema["cookies"]>): void {
  appStore.set("cookies", { ...appStore.get("cookies"), ...cookies });
}

export function clearAuth(): void {
  appStore.set("cookies", defaults.cookies);
  appStore.set("user", null);
  appStore.set("refreshToken", "");
  appStore.set("accessToken", "");
}

export function isLoggedIn(): boolean {
  return Boolean(appStore.get("cookies").SESSDATA);
}
