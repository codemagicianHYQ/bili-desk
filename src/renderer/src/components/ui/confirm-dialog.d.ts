import { type ReactNode } from 'react';
interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: ReactNode;
}
export declare function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, destructive, loading, onConfirm, onCancel, children }: ConfirmDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
