import type { FollowTag } from "@shared/types";
interface FollowTagDialogProps {
    up: {
        mid: number;
        uname: string;
    } | null;
    tags: FollowTag[];
    onClose: () => void;
    onSaved: (change: {
        prevTagIds: number[];
        nextTagIds: number[];
    }) => void;
}
export declare function FollowTagDialog({ up, tags, onClose, onSaved, }: FollowTagDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
