import type { BiliDashPlayInfo } from "@shared/types";
export declare function attachBiliDash(video: HTMLVideoElement, dash: BiliDashPlayInfo, onError: (message: string) => void): () => void;
