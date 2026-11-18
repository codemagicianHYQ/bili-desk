import type { CollectionClassifyMode, CollectionClassifyProgress, CollectionClassifyResult, CollectionGroupMap, CollectionListKind, UserCollectionItem } from "@shared/types";
type ProgressFn = (progress: CollectionClassifyProgress) => void;
export declare function fetchAllCollections(listKind: CollectionListKind): Promise<UserCollectionItem[]>;
/** 本地分类的范围：我收藏的 + 我创建的 */
export declare function fetchLocalCollections(): Promise<UserCollectionItem[]>;
export declare function getCollectionGroups(): CollectionGroupMap;
export declare function setCollectionGroup(key: string, group: {
    l1: string;
    l2: string;
} | null): CollectionGroupMap;
export declare function renameCollectionGroup(l1: string, l2: string | null, name: string): CollectionGroupMap;
export declare function classifyCollections(mode: CollectionClassifyMode, onProgress: ProgressFn): Promise<CollectionClassifyResult>;
export {};
