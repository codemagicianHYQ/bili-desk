import type { FavClassifyResumeInfo } from "@shared/types";
import { type FavFolderGroupOverrides } from "@shared/utils/fav-folder-groups";
export declare class FavClassifyEngine {
    private organizeTaskId;
    private classifyAllTaskId;
    startClassifyAll(): number;
    getClassifyAllResume(): FavClassifyResumeInfo;
    startClassifyFolder(mediaId: number): number;
    startOrganizeBiliFolders(overrides?: FavFolderGroupOverrides): number;
    startMergeDumpIntoDefault(): number;
    startMergeDuplicateTopics(): number;
    private startExclusiveFavTask;
    private runClassifyAll;
    private runClassifyFolder;
    private runOrganizeBiliFolders;
    private runMergeDumpIntoDefault;
    private runMergeDuplicateTopics;
    private mergeDuplicateTopicFolders;
    private moveAidsBestEffort;
}
export declare const favClassifyEngine: FavClassifyEngine;
