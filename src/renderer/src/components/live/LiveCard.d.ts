import type { LiveRoomItem } from "@shared/types";
interface LiveCardProps {
    room: LiveRoomItem;
    className?: string;
    showFollowedBadge?: boolean;
}
export declare function LiveCard({ room, className, showFollowedBadge, }: LiveCardProps): import("react/jsx-runtime").JSX.Element;
export {};
