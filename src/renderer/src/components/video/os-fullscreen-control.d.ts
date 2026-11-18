import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";
export declare function setPlayerFillLayout(on: boolean): void;
/** @deprecated 与 setPlayerFillLayout 相同，保留给旧调用 */
export declare function setOsFullscreenLayout(on: boolean): void;
export declare function bindPlayerResize(art: Artplayer, container: HTMLElement): () => void;
export declare function exitPlayerFill(art: Artplayer | null | undefined): void;
/**
 * 网页全屏：播放器铺满应用窗口，侧栏/顶栏隐藏，窗口本身不进系统全屏。
 * 不要用 art.fullscreenWeb：会把节点挪到 body，DASH/MSE 容易卡死。
 */
export declare function createWebFullscreenControl(): ComponentOption;
/**
 * Electron 窗口全屏（显示器铺满）。布局与网页全屏共用，另外再 setFullscreen。
 */
export declare function createOsFullscreenControl(): ComponentOption;
