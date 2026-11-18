import type { UserRelationListType } from "@shared/types";
interface UpRelationListPanelProps {
    mid: number;
    type: UserRelationListType;
    ownerName: string;
    onClose: () => void;
    onPrivacyBlocked: (message: string) => void;
}
export declare function UpRelationListPanel({ mid, type, ownerName, onClose, onPrivacyBlocked, }: UpRelationListPanelProps): import("react").ReactPortal;
export {};
