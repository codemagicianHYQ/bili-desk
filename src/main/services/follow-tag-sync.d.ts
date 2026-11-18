import type { FollowTagSyncPlan, FollowTagSyncStatus } from "@shared/types";
export declare function previewFollowTagSync(followedMids: number[]): Promise<FollowTagSyncPlan>;
export declare function startFollowTagSync(planId: string): Promise<void>;
export declare function getFollowTagSyncStatus(): FollowTagSyncStatus;
export declare function cancelFollowTagSync(): void;
