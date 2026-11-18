import type { UserCollectionItem } from "@shared/types";
export declare const UNGROUPED_COLLECTION_L1 = "\u672A\u5206\u7EC4";
export declare function collectionGroupKey(item: Pick<UserCollectionItem, "kind" | "id">): string;
