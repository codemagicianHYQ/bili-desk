export interface MobileVideo {
    bvid: string;
    title: string;
    cover: string;
    duration: number;
    play: number;
    author: string;
    cid: number;
}
export interface MobilePlay {
    bvid: string;
    cid: number;
    title: string;
    author: string;
    cover: string;
    url: string;
    quality: number;
}
export declare function isLoggedIn(): boolean;
export declare function currentUserId(): string;
export declare function logout(): void;
export declare function getRecommend(freshIdx?: number): Promise<MobileVideo[]>;
export declare function getPopular(page?: number): Promise<MobileVideo[]>;
export declare function searchVideos(keyword: string, page?: number): Promise<{
    videos: MobileVideo[];
    total: number;
}>;
export declare function getPlay(bvid: string): Promise<MobilePlay>;
export declare function createLoginQr(): Promise<{
    url: string;
    key: string;
}>;
export declare function pollLogin(key: string): Promise<"wait" | "scanned" | "ok" | "expired">;
