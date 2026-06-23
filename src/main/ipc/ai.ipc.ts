import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { aiService } from '../services/ai-service'
import { classifyEngine } from '../services/classify-engine'
import { taxonomyRepo } from '../db/repositories/taxonomy'
import type { AiConfig } from '@shared/types'

export function registerAiIpc(): void {
  ipcMain.handle(IPC.AI_CONFIG_GET, () => aiService.getConfig())
  ipcMain.handle(IPC.AI_CONFIG_SET, (_e, config: Partial<AiConfig>) => aiService.setConfig(config))
  ipcMain.handle(IPC.AI_RUN_UP_CLASSIFY, () => {
    const taskId = classifyEngine.startUpClassification()
    return { taskId }
  })
  ipcMain.handle(IPC.AI_TASK_STATUS, (_e, taskId: number) => taxonomyRepo.getTask(taskId))
}
