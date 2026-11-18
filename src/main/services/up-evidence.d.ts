import { type Evidence, type TaxonomyMatch } from "./collection-taxonomy";
export declare function cleanUpSign(sign: string): string;
export declare function buildUpEvidence(up: {
    uname: string;
    sign: string;
    official?: {
        title: string;
    };
}, titles: string[]): Evidence[];
export type UpMatchLevel = "rule" | "weak";
/**
 * 「确定」：分数够，并且明显领先第二名。
 * 第一名已经够分、只是和第二名接近时，归低把握，不要因为分差不够就丢回未分组。
 * 总分已经很高但跨类接近（比如科技和 AI 都命中），也归低把握，别扔回未分组。
 */
export declare function judgeUpMatch(match: TaxonomyMatch | null): UpMatchLevel | null;
export declare function classifyUpEvidence(up: {
    uname: string;
    sign: string;
    official?: {
        title: string;
    };
}, titles: string[]): {
    match: TaxonomyMatch | null;
    level: UpMatchLevel | null;
};
