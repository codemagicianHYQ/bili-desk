import type { SearchMediaKind } from "@shared/types";
interface SearchMediaPanelProps {
    keyword: string;
    kind: SearchMediaKind;
    active: boolean;
    onTotalChange?: (total: number) => void;
}
export declare function SearchMediaPanel({ keyword, kind, active, onTotalChange, }: SearchMediaPanelProps): import("react/jsx-runtime").JSX.Element | null;
export {};
