import type { LiveRoomItem } from "@shared/types";
interface FollowingLiveListProps {
    rooms: LiveRoomItem[];
    count: number;
    className?: string;
}
export declare function FollowingLiveList({ rooms, count, className, }: FollowingLiveListProps): import("react/jsx-runtime").JSX.Element | null;
export {};
