import type { FollowingUp } from "@shared/types";
interface FollowingUpCardProps {
    up: FollowingUp;
    showGroupActions?: boolean;
    isSpecial?: boolean;
    specialPending?: boolean;
    highlighted?: boolean;
    onSetGroup: (up: FollowingUp) => void;
    onToggleSpecial: (up: FollowingUp, special: boolean) => void;
    onUnfollow: (up: FollowingUp) => void;
}
export declare function FollowingUpCard({ up, showGroupActions, isSpecial, specialPending, highlighted, onSetGroup, onToggleSpecial, onUnfollow, }: FollowingUpCardProps): import("react/jsx-runtime").JSX.Element;
export {};
