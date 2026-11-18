import type { FollowingUp, UpAssignmentPath, UpGroupSelection } from "@shared/types";
export interface FollowingSearchHit {
    up: FollowingUp;
    localPath: string | null;
    localSelection: UpGroupSelection | null;
    biliTags: string[];
}
interface FollowingSearchProps {
    followings: FollowingUp[] | null;
    assignments: UpAssignmentPath[];
    biliTagByMid: Map<number, string[]>;
    loading?: boolean;
    onPickLocal: (selection: UpGroupSelection, mid: number) => void;
    className?: string;
}
export declare function FollowingSearch({ followings, assignments, biliTagByMid, loading, onPickLocal, className, }: FollowingSearchProps): import("react/jsx-runtime").JSX.Element;
export {};
