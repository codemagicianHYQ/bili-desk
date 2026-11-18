import type { UpPortraitGraph } from "@shared/types";
export declare function readUpPortraitGraph(): UpPortraitGraph;
/** 用关注列表、已缓存的投稿标题和本地分组结果重建画像库，不额外抓标题 */
export declare function rebuildUpPortraits(): Promise<UpPortraitGraph>;
