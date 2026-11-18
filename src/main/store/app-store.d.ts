import type { AbnormalFollowingRecord, AiConfig, CollectionGroupMap, InvalidVideoRecord, Theme, ToViewItem, UpActivityRecord, UpVideoSpecial, UserInfo } from "@shared/types";
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
    /** TV 扫码登录令牌到期时间（毫秒时间戳），0 表示未知 */
    tokenExpiresAt: number;
    localDb: unknown;
    /** 官方稍后再看满员后溢出到本机的列表 */
    localToView: ToViewItem[];
    /** 失效视频归档（收藏 / 稍后再看） */
    invalidVideos: InvalidVideoRecord[];
    /** 关注里被封 / 注销的 UP */
    abnormalFollowings: AbnormalFollowingRecord[];
    /** 仍有效时缓存标题/UP，失效后用来还原展示 */
    videoMetaCache: Record<string, {
        title: string;
        cover: string;
        upperMid: number;
        upperName: string;
        updatedAt: number;
    }>;
    lastIntegrityScanAt: number;
    /** 关注 UP 活跃度（最新稿件 / 动态时间） */
    upActivityCache: UpActivityRecord[];
    lastUpActivityScanAt: number;
    /** 合集 AI / 规则整理结果，key 见 collectionGroupKey */
    collectionGroups: CollectionGroupMap;
    /** 合集分类用的视频标题 / 标签缓存，避免重整时重复抓取 */
    collectionSamples: Record<string, {
        titles: string[];
        bvids: string[];
        tags?: string[];
        at: number;
    }>;
    /** 关注分类用的 UP 近期稿件标题缓存，key 为 mid */
    upTitleCache: Record<string, {
        titles: string[];
        at: number;
    }>;
    /** 投稿筛选（充电专属等）。arc/search 被限流时备用列表没有这项，用上次确认的结果 */
    upVideoSpecials: Record<string, UpVideoSpecial[]>;
    /** 稿件是否充电专属。空串表示已经确认不是 */
    chargeVideoBadges: Record<string, {
        v: string;
        at: number;
    }>;
    /** 每位 UP 的分类结果；浅层整理直接沿用，深度整理重新判断 */
    upClassifyCache: Record<string, UpClassifyCacheEntry>;
    /** 进行中的深度整理；中断后再跑会跳过这次已经判断过的 UP */
    upClassifyDeepRun: {
        startedAt: number;
        version: string;
    } | null;
    /** 关注 UP 画像：多标签领域，供领域图读取 */
    upPortraits: {
        updatedAt: number;
        titledCount: number;
        items: Array<{
            mid: number;
            uname: string;
            face: string;
            tags: Array<{
                l1: string;
                l2: string;
                score: number;
            }>;
            headline: string;
            updatedAt: number;
        }>;
    };
}
export interface UpClassifyCacheEntry {
    /** 空串表示没有线索，留在未分组 */
    l1: string;
    l2: string;
    source: "rule" | "ai" | "rule-weak" | "none";
    confidence: number;
    at: number;
    /** 判断时的规则指纹 */
    version: string;
    /** 判断时有没有可用的 AI；没 AI 时的低把握结果，配上 AI 后浅层整理会重判 */
    aiTried: boolean;
}
export declare function flushAppStore(): void;
interface CachedAppStore {
    get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
    set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
    set(key: string, value: unknown): void;
}
export declare const appStore: CachedAppStore;
export declare function getCookieString(): string;
export declare function setCookies(cookies: Partial<StoreSchema["cookies"]>): void;
export declare function clearAuth(): void;
export declare function isLoggedIn(): boolean;
export {};
