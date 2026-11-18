import type { UpProfile, UpRelation, UserRelationListType } from "@shared/types";
export declare function UpSpaceHeader({ profile, relation, currentMid, onOpenRelation, onRelationChange, onSpecialChange, onError, }: {
    profile: UpProfile;
    relation: UpRelation | null;
    currentMid: number;
    onOpenRelation: (type: UserRelationListType) => void;
    onRelationChange: (following: boolean) => void;
    onSpecialChange: (special: boolean) => void;
    onError: (message: string) => void;
}): import("react/jsx-runtime").JSX.Element;
