import type { CategoryL1, CategoryL2, CategoryL3, CategoryTreeNode, ClassificationTask, FavoriteItemAssignment, UpGroup, UpGroupSelection, UpGroupTreeNode } from "@shared/types";
type DbUpGroup = {
    id: number;
    name: string;
    color: string;
    isAiGenerated: boolean;
    sortOrder: number;
    parentId: number | null;
    /** 用户改名前 AI/规则用的名字；重新分组按它找回同一个分组 */
    sourceName?: string;
};
export declare class TaxonomyRepository {
    ensureDefaultFavTaxonomy(): void;
    /** 补全「学习」「娱乐」「生活」等一级分类，供分类规则使用 */
    ensureExtendedFavTaxonomy(): void;
    /**
     * 全量智能分类前重置目录，清除历史重复 L2/L3 与旧映射。
     * 保留一级分类名称（含用户改名），二级仅保留计算机下的默认骨架。
     */
    resetFavCategoriesForClassify(): void;
    listL1(): CategoryL1[];
    createL1(name: string, icon?: string): CategoryL1;
    createL2(categoryL1Id: number, name: string): CategoryL2;
    createL3(categoryL2Id: number, name: string): CategoryL3;
    findL1ByName(name: string): CategoryL1 | undefined;
    findOrCreateL2(categoryL1Id: number, name: string): CategoryL2;
    findOrCreateL3(categoryL2Id: number, name: string): CategoryL3;
    updateCategoryName(level: "l1" | "l2" | "l3", id: number, name: string): void;
    assignFavorite(input: {
        mediaId: number;
        avid: number;
        bvid?: string;
        title?: string;
        categoryL1Id: number | null;
        categoryL2Id: number | null;
        categoryL3Id: number | null;
    }): void;
    assignFavoritesBatch(inputs: Array<{
        mediaId: number;
        avid: number;
        bvid?: string;
        title?: string;
        cover?: string;
        upperName?: string;
        duration?: number;
        categoryL1Id: number | null;
        categoryL2Id: number | null;
        categoryL3Id: number | null;
    }>): void;
    createClassificationWriter(): {
        findL1ByName: (name: string) => CategoryL1 | undefined;
        findOrCreateL1: (name: string, icon?: string) => CategoryL1;
        findOrCreateL2: (categoryL1Id: number, name: string) => CategoryL2;
        findOrCreateL3: (categoryL2Id: number, name: string) => CategoryL3;
        commitAssignments: (assignments: Array<{
            mediaId: number;
            avid: number;
            bvid: string;
            title: string;
            cover?: string;
            upperName?: string;
            duration?: number;
            categoryL1Id: number | null;
            categoryL2Id: number | null;
            categoryL3Id: number | null;
        }>) => void;
    };
    /** 全量分类跑完后删掉已经不在任何收藏夹里的旧映射 */
    pruneFavoriteAssignments(keepMediaIds: Set<number>): number;
    getFavoriteAssignments(): FavoriteItemAssignment[];
    repairTaxonomy(): void;
    enrichFavoriteCovers(briefs: Array<{
        bvid: string;
        cover: string;
        upperName: string;
        duration: number;
    }>): number;
    getMissingCoverBvids(limit?: number): string[];
    getMissingCoverCount(): number;
    getAssignmentByMediaId(mediaId: number): FavoriteItemAssignment | undefined;
    matchesLocalCategory(mediaId: number, selection: {
        level: "all" | "l1" | "l2" | "l3" | "uncategorized";
        id: number | null;
    }): boolean;
    getTree(): CategoryTreeNode[];
    getCategoryCounts(): Record<string, number>;
    getUpGroups(): UpGroup[];
    /** 删掉没有成员的自动分组（手动建的保留），一级下没子分组也一并删 */
    pruneEmptyAiUpGroups(): void;
    getUpGroupTree(): UpGroupTreeNode[];
    getUpGroupMemberMids(selection: UpGroupSelection): number[];
    createUpClassificationWriter(): {
        findOrCreateL1(name: string): DbUpGroup;
        findOrCreateL2(l1Id: number, name: string): DbUpGroup;
    };
    resolveUpGroupId(l1Name: string, l2Name: string): number;
    getUpLeafGroups(): Array<{
        id: number;
        path: string;
    }>;
    /** 现有 UP 分组结果，按 AI/规则原名给出一级 / 二级（改过名的也能找回原分组） */
    getUpAssignmentPaths(): Array<{
        mid: number;
        l1: string;
        l2: string;
        l1Id: number;
        l2Id: number;
        source: string;
        confidence: number;
    }>;
    /** 要同步到 B 站的分组：二级分组，以及没有子分组但直接挂了 UP 的一级分组 */
    getUpSyncLeaves(): Array<{
        groupId: number;
        l1Name: string;
        l2Name: string | null;
        mids: number[];
    }>;
    renameUpGroup(id: number, name: string): void;
    /** ids 是同一父级下的分组，按传入顺序重排 */
    reorderUpGroups(ids: number[]): void;
    createUpGroup(name: string, color?: string): UpGroup;
    createTask(type: string): ClassificationTask;
    updateTask(id: number, patch: Partial<Pick<ClassificationTask, "status" | "progress" | "message">>): void;
    getTask(id: number): ClassificationTask | null;
    assignUp(mid: number, groupId: number, source: string, confidence: number): void;
    assignUpsBatch(entries: Array<{
        mid: number;
        groupId: number;
        source: string;
        confidence: number;
    }>): void;
    replaceAllUpMembers(entries: Array<{
        mid: number;
        groupId: number;
        source: string;
        confidence: number;
    }>): void;
}
export declare const taxonomyRepo: TaxonomyRepository;
export declare function initDb(): void;
export {};
