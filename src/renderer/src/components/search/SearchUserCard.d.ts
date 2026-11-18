import type { SearchUserItem } from "@shared/types";
interface SearchUserCardProps {
    user: SearchUserItem;
    followed?: boolean;
    onFollowChange?: (mid: number, following: boolean) => void;
}
export declare function SearchUserCard({ user, followed, onFollowChange, }: SearchUserCardProps): import("react/jsx-runtime").JSX.Element;
export {};
