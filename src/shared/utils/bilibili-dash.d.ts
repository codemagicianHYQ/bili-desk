export interface BiliDashSegmentBase {
    initialization: string;
    indexRange: string;
}
export interface BiliDashTrack {
    id: number;
    baseUrl: string;
    /** CDN 备用地址，主链失败时 dash.js 可回退 */
    backupUrls?: string[];
    bandwidth: number;
    mimeType: string;
    codecs: string;
    width?: number;
    height?: number;
    frameRate?: string;
    segmentBase: BiliDashSegmentBase;
}
export interface BiliDashPlayData {
    duration: number;
    video: BiliDashTrack;
    audio: BiliDashTrack;
}
/** 将 B 站 DASH 音视频轨转为 MPD XML（给本地代理 / dash.js 用） */
export declare function buildDashMpdXml(data: BiliDashPlayData): string;
/** 将 B 站 DASH 音视频轨转为 dash.js 可识别的 MPD Data URI */
export declare function buildDashMpdUri(data: BiliDashPlayData): string;
