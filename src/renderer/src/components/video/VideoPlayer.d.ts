import type { VideoPlayInfo, VideoSubtitleTrack } from "@shared/types";
interface VideoPlayerProps {
    playInfo: VideoPlayInfo;
    aid: number;
    bvid: string;
    cid: number;
    poster?: string;
    active?: boolean;
    /** 优先于本地缓存的续播秒数（如历史记录进度） */
    initialTime?: number;
    reloadKey?: number;
    /** CC / AI 字幕轨（已转 WebVTT） */
    subtitleTracks?: VideoSubtitleTrack[];
    /** 0 = 自动，其余为 B 站 qn */
    selectedQn?: number;
    onQualityChange: (qn: number) => void;
    onError?: (message: string, kind?: "stall" | "decode" | "other", detail?: string) => void;
    /** 用户选择从头观看时回调（用于清掉 URL 续播参数） */
    onWatchFromStart?: () => void;
    /** 章节跳转：time 为秒，nonce 用来重复点同一章节 */
    seekAt?: {
        time: number;
        nonce: number;
    } | null;
    /** 稿件完整时长。试看文件更短时，进度条按这个时长显示 */
    timelineDuration?: number;
    /** 试看播到片段结尾，或拖进未解锁的后半段 */
    onPreviewBoundary?: (ended: boolean) => void;
    /** 试看文件的秒数，用来标出可看区间 */
    onPreviewLength?: (seconds: number) => void;
    className?: string;
}
export declare function VideoPlayer({ playInfo, aid, bvid, cid, poster, active, initialTime, reloadKey, subtitleTracks, selectedQn, onQualityChange, onError, onWatchFromStart, seekAt, timelineDuration, onPreviewBoundary, onPreviewLength, className, }: VideoPlayerProps): import("react/jsx-runtime").JSX.Element;
export {};
