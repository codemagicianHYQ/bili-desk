/** 自动：由播放器按账号权限请求默认档 */
export declare const BILI_AUTO_QN = 0;
/** 登录用户常见最高免费档，接口会按权限自动降级 */
export declare const BILI_DEFAULT_QN = 80;
export interface PlayQualityOption {
    qn: number;
    label: string;
    needVip?: boolean;
    needLogin?: boolean;
    superscript?: string;
}
export interface PlayPrivilege {
    isVip: boolean;
    trialAble: boolean;
    trialRemaining: number | null;
}
export declare function formatBiliQualityLabel(qn: number, fallback?: string): string;
/** 控制栏短标签，避免「1080P 高清」把全屏按钮挤出视口 */
export declare function shortQualityLabel(qn: number, fullLabel?: string): string;
export declare function resolvePlayQn(qn?: number): number;
export declare function isVipQuality(qn: number): boolean;
export declare function canUseVipQuality(privilege: PlayPrivilege): boolean;
/** 已确认无大会员且试看次数用尽时拦截；次数未知时交给服务端 */
export declare function isVipQualityBlocked(privilege: PlayPrivilege): boolean;
export declare function vipQualityBlockedNotice(qn: number): string;
export declare function vipQualityTrialNotice(qn: number, remainingAfter: number): string;
export declare function buildQualityOptions(acceptQuality: number[], acceptDescription?: string[]): PlayQualityOption[];
export declare function parsePlayQualities(data: {
    accept_quality?: number[];
    accept_description?: string[];
    support_formats?: Array<{
        quality?: number;
        new_description?: string;
        display_desc?: string;
        description?: string;
        superscript?: string;
        need_vip?: boolean;
        needVip?: boolean;
        need_login?: boolean;
        needLogin?: boolean;
    }>;
}): PlayQualityOption[];
export declare function mergeQualityOptions(...lists: Array<Array<PlayQualityOption> | undefined>): PlayQualityOption[];
export declare function parsePlayPrivilegeFromPayload(data: Record<string, unknown> | undefined): Partial<PlayPrivilege>;
export declare function mergePlayPrivilege(...parts: Array<Partial<PlayPrivilege> | undefined>): PlayPrivilege;
