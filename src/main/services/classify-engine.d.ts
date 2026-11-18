import type { UpClassifyInfo, UpClassifyMode } from "@shared/types";
export declare class ClassifyEngine {
    private runningTaskId;
    getUpClassifyInfo(): UpClassifyInfo;
    runUpClassification(taskId: number, mode: UpClassifyMode): Promise<void>;
    startUpClassification(mode?: UpClassifyMode): number;
}
export declare const classifyEngine: ClassifyEngine;
