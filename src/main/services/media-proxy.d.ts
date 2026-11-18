export declare const MEDIA_SCHEME = "bilimedia";
export declare function handleBilimediaProtocol(request: Request): Promise<Response>;
/** 必须在 app.whenReady 之前调用 */
export declare function registerMediaScheme(): void;
export declare function attachMediaProtocol(): void;
export declare function startMediaProxy(): Promise<void>;
export declare function wrapMediaUrl(realUrl: string, referer: string): string;
export declare function wrapMpd(xml: string): string;
/** 主进程拉 DASH 分片，避开渲染进程 CORS / Private Network Access */
export declare function fetchMediaRange(url: string, referer: string, range?: string): Promise<Uint8Array>;
