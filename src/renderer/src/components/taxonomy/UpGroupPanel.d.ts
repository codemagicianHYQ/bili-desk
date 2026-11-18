import type { UpGroup } from '@shared/types';
interface UpGroupPanelProps {
    groups: UpGroup[];
    selectedId?: number | null;
    onSelect?: (id: number) => void;
}
export declare function UpGroupPanel({ groups, selectedId, onSelect }: UpGroupPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
