interface FollowActionButtonProps {
    mid: number;
    uname: string;
    face?: string;
    isFollowing: boolean;
    isSpecial?: boolean;
    disabled?: boolean;
    size?: "default" | "sm";
    className?: string;
    onFollowingChange: (following: boolean) => void;
    onSpecialChange?: (special: boolean) => void;
    onError?: (message: string) => void;
}
export declare function FollowActionButton({ mid, uname, face, isFollowing, isSpecial, disabled, size, className, onFollowingChange, onSpecialChange, onError, }: FollowActionButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
