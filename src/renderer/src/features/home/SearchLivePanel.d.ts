interface SearchLivePanelProps {
    keyword: string;
    active: boolean;
    onTotalChange?: (total: number) => void;
}
export declare function SearchLivePanel({ keyword, active, onTotalChange, }: SearchLivePanelProps): import("react/jsx-runtime").JSX.Element | null;
export {};
