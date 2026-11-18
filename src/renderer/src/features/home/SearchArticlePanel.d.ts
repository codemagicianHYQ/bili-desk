interface SearchArticlePanelProps {
    keyword: string;
    active: boolean;
    /** 用真实搜索总数校正 Tab 角标，避免综合统计与列表不一致 */
    onTotalChange?: (total: number) => void;
}
export declare function SearchArticlePanel({ keyword, active, onTotalChange, }: SearchArticlePanelProps): import("react/jsx-runtime").JSX.Element | null;
export {};
