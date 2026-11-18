export interface Evidence {
    text: string;
    weight: number;
}
export interface TaxonomyMatch {
    l1: string;
    l2: string;
    score: number;
    /** 第二名一级分类的得分，用来判断是否压倒性 */
    runnerUp: number;
    /** 有几条证据命中了胜出的一级 */
    support: number;
}
/** 同一位 UP 可以同时命中的多个领域 */
export interface TaxonomyTag {
    l1: string;
    l2: string;
    score: number;
}
export declare function scoreEvidence(evidence: Evidence[]): TaxonomyMatch | null;
/** 留下分数够高的多个二级领域，供画像贴标签，不替代单一分组结果 */
export declare function scoreEvidenceTags(evidence: Evidence[], limit?: number): TaxonomyTag[];
/** 置信：总分够高且明显领先第二名 */
export declare function isConfident(match: TaxonomyMatch | null, minScore: number): boolean;
export declare const SUGGESTED_L1: string[];
export declare function taxonomyTree(): Array<{
    name: string;
    children: string[];
}>;
/** 规则表的指纹：规则或目录一改就变，用来判断缓存的分类是不是旧规则算的 */
export declare function taxonomyRulesFingerprint(): string;
export declare function suggestedTreeText(): string[];
