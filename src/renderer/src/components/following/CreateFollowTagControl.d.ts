import type { FollowTag } from "@shared/types";
interface CreateFollowTagControlProps {
    disabled?: boolean;
    className?: string;
    onCreated?: (tag: FollowTag) => void;
}
export declare function CreateFollowTagControl({ disabled, className, onCreated, }: CreateFollowTagControlProps): import("react/jsx-runtime").JSX.Element;
export {};
