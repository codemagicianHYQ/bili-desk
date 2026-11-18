/** Artplayer `thumbnails` 选项 */
export interface PlayerThumbnails {
    url: string;
    number: number;
    column: number;
    width: number;
    height: number;
}
export declare function loadPlayerThumbnails(bvid: string, cid: number): Promise<PlayerThumbnails | null>;
