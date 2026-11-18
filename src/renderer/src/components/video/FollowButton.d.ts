interface FollowButtonProps {
    isFollowing: boolean;
    loading?: boolean;
    disabled?: boolean;
    onClick: () => void;
    size?: 'default' | 'sm';
    className?: string;
}
export declare function FollowButton({ isFollowing, loading, disabled, onClick, size, className }: FollowButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
