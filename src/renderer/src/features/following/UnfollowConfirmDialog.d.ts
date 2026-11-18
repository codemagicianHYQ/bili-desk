import type { FollowingUp } from "@shared/types";
interface UnfollowConfirmDialogProps {
    up: FollowingUp | null;
    loading?: boolean;
    error?: string;
    onConfirm: () => void;
    onCancel: () => void;
}
export declare function UnfollowConfirmDialog({ up, loading, error, onConfirm, onCancel, }: UnfollowConfirmDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
