import type { FootprintSyncKinds, FootprintSyncProgress } from "@shared/types";
export declare function getFootprintSyncStatus(): FootprintSyncProgress;
export declare function abortFootprintSync(): void;
export declare function startFootprintSync(kinds?: FootprintSyncKinds, options?: {
    reset?: boolean;
}): Promise<FootprintSyncProgress>;
