import type { FollowTag } from "@shared/types";
interface FollowTagListProps {
    tags: FollowTag[];
    selectedTagId: number | null;
    onSelect: (tagId: number) => void;
    onRenamed: (tagId: number, name: string) => void;
    onDeleted: (tagId: number) => void;
    onMessage: (message: string) => void;
}
export declare function FollowTagList({ tags, selectedTagId, onSelect, onRenamed, onDeleted, onMessage, }: FollowTagListProps): import("react/jsx-runtime").JSX.Element;
export {};
