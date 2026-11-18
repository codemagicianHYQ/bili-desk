/**
 * 视频 / 专栏 / 动态 / 直播 / UP 主页走应用内；
 * 短链先展开。映射不了的（活动页、广告落地、外站）用系统浏览器打开。
 */
export declare function openBiliHref(href: string, navigate: (path: string) => void): Promise<void>;
