export declare function progressKey(bvid: string, cid: number): string;
export declare function getPlaybackProgress(bvid: string, cid: number): number | undefined;
export declare function savePlaybackProgress(bvid: string, cid: number, time: number, duration: number): void;
export declare function clearPlaybackProgress(bvid: string, cid: number): void;
