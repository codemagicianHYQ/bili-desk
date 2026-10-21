import type { UserCollectionItem } from "@shared/types";

export const UNGROUPED_COLLECTION_L1 = "未分组";

export function collectionGroupKey(
  item: Pick<UserCollectionItem, "kind" | "id">,
): string {
  return `${item.kind}:${item.id}`;
}
