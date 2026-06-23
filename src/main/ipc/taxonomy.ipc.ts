import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { UpGroupSelection } from '@shared/types'
import { taxonomyRepo } from '../db/repositories/taxonomy'
import { favClassifyEngine } from '../services/fav-classify-engine'
import { biliApi } from '../services/bili-api'

export function registerTaxonomyIpc(): void {
  ipcMain.handle(IPC.TAXONOMY_TREE, () => taxonomyRepo.getTree())
  ipcMain.handle(IPC.TAXONOMY_L1_LIST, () => taxonomyRepo.listL1())
  ipcMain.handle(IPC.TAXONOMY_L1_CREATE, (_e, name: string, icon?: string) =>
    taxonomyRepo.createL1(name, icon)
  )
  ipcMain.handle(IPC.TAXONOMY_L2_CREATE, (_e, categoryL1Id: number, name: string) =>
    taxonomyRepo.createL2(categoryL1Id, name)
  )
  ipcMain.handle(IPC.TAXONOMY_L3_CREATE, (_e, categoryL2Id: number, name: string) =>
    taxonomyRepo.createL3(categoryL2Id, name)
  )
  ipcMain.handle(IPC.TAXONOMY_CATEGORY_UPDATE, (_e, level: 'l1' | 'l2' | 'l3', id: number, name: string) => {
    taxonomyRepo.updateCategoryName(level, id, name)
  })
  ipcMain.handle(IPC.TAXONOMY_FAV_ASSIGNMENTS, () => taxonomyRepo.getFavoriteAssignments())
  ipcMain.handle(IPC.TAXONOMY_FAV_CLASSIFY_ALL, () => {
    const taskId = favClassifyEngine.startClassifyAll()
    return { taskId }
  })
  ipcMain.handle(IPC.TAXONOMY_FAV_CLASSIFY_FOLDER, (_e, mediaId: number) => {
    const taskId = favClassifyEngine.startClassifyFolder(mediaId)
    return { taskId }
  })
  ipcMain.handle(IPC.TAXONOMY_FAV_TASK_STATUS, (_e, taskId: number) => taxonomyRepo.getTask(taskId))
  ipcMain.handle(IPC.TAXONOMY_FAV_ENRICH_COVERS, async () => {
    const bvids = taxonomyRepo.getMissingCoverBvids(80)
    if (bvids.length === 0) {
      return { updated: 0, remaining: 0 }
    }
    const briefs = await biliApi.getVideoBriefs(bvids)
    const updated = taxonomyRepo.enrichFavoriteCovers(briefs)
    return { updated, remaining: taxonomyRepo.getMissingCoverCount() }
  })
  ipcMain.handle(IPC.TAXONOMY_UP_GROUPS, () => taxonomyRepo.getUpGroups())
  ipcMain.handle(IPC.TAXONOMY_UP_GROUP_TREE, () => taxonomyRepo.getUpGroupTree())
  ipcMain.handle(IPC.TAXONOMY_UP_GROUP_CREATE, (_e, name: string, color?: string) =>
    taxonomyRepo.createUpGroup(name, color)
  )
  ipcMain.handle(IPC.TAXONOMY_UP_GROUP_MEMBERS, (_e, selection: UpGroupSelection) =>
    taxonomyRepo.getUpGroupMemberMids(selection)
  )
}
