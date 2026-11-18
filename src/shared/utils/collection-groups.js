export const UNGROUPED_COLLECTION_L1 = "未分组";
export function collectionGroupKey(item) {
    return `${item.kind}:${item.id}`;
}
