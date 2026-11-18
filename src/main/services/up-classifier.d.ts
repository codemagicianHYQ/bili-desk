export interface UpCategoryMatch {
    l1: string;
    l2?: string;
}
export declare function classifyUpText(text: string): UpCategoryMatch | null;
