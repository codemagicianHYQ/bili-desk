import { ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import { aiService } from "../services/ai-service";
import { classifyEngine } from "../services/classify-engine";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import type { AiConfig, UpClassifyMode } from "@shared/types";

export function registerAiIpc(): void {
  ipcMain.handle(IPC.AI_CONFIG_GET, () => aiService.getConfig());
  ipcMain.handle(IPC.AI_CONFIG_SET, (_e, config: Partial<AiConfig>) =>
    aiService.setConfig(config),
  );
  ipcMain.handle(IPC.AI_TEST, () => aiService.testConnection());
  ipcMain.handle(IPC.AI_RUN_UP_CLASSIFY, (_e, mode?: UpClassifyMode) => {
    const taskId = classifyEngine.startUpClassification(
      mode === "deep" ? "deep" : "shallow",
    );
    return { taskId };
  });
  ipcMain.handle(IPC.AI_UP_CLASSIFY_INFO, () =>
    classifyEngine.getUpClassifyInfo(),
  );
  ipcMain.handle(IPC.AI_TASK_STATUS, (_e, taskId: number) =>
    taxonomyRepo.getTask(taskId),
  );
}
