import { ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { favClassifyEngine } from "../services/fav-classify-engine";
import { biliApi } from "../services/bili-api";
import { readUpPortraitGraph, rebuildUpPortraits, } from "../services/up-portrait";
export function registerTaxonomyIpc() {
    ipcMain.handle(IPC.TAXONOMY_TREE, () => taxonomyRepo.getTree());
    ipcMain.handle(IPC.TAXONOMY_L1_LIST, () => taxonomyRepo.listL1());
    ipcMain.handle(IPC.TAXONOMY_L1_CREATE, (_e, name, icon) => taxonomyRepo.createL1(name, icon));
    ipcMain.handle(IPC.TAXONOMY_L2_CREATE, (_e, categoryL1Id, name) => taxonomyRepo.createL2(categoryL1Id, name));
    ipcMain.handle(IPC.TAXONOMY_L3_CREATE, (_e, categoryL2Id, name) => taxonomyRepo.createL3(categoryL2Id, name));
    ipcMain.handle(IPC.TAXONOMY_CATEGORY_UPDATE, (_e, level, id, name) => {
        taxonomyRepo.updateCategoryName(level, id, name);
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_ASSIGNMENTS, () => taxonomyRepo.getFavoriteAssignments());
    ipcMain.handle(IPC.TAXONOMY_FAV_CLASSIFY_ALL, () => {
        const taskId = favClassifyEngine.startClassifyAll();
        return { taskId };
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_CLASSIFY_FOLDER, (_e, mediaId) => {
        const taskId = favClassifyEngine.startClassifyFolder(mediaId);
        return { taskId };
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_ORGANIZE_BILI, (_e, overrides) => {
        const taskId = favClassifyEngine.startOrganizeBiliFolders(overrides ?? {});
        return { taskId };
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_MERGE_DUMP, () => {
        const taskId = favClassifyEngine.startMergeDumpIntoDefault();
        return { taskId };
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_MERGE_DUP_TOPICS, () => {
        const taskId = favClassifyEngine.startMergeDuplicateTopics();
        return { taskId };
    });
    ipcMain.handle(IPC.TAXONOMY_FAV_CLASSIFY_RESUME, () => favClassifyEngine.getClassifyAllResume());
    ipcMain.handle(IPC.TAXONOMY_FAV_TASK_STATUS, (_e, taskId) => taxonomyRepo.getTask(taskId));
    ipcMain.handle(IPC.TAXONOMY_FAV_ENRICH_COVERS, async () => {
        const bvids = taxonomyRepo.getMissingCoverBvids(80);
        if (bvids.length === 0) {
            return { updated: 0, remaining: 0 };
        }
        const briefs = await biliApi.getVideoBriefs(bvids);
        const updated = taxonomyRepo.enrichFavoriteCovers(briefs);
        return { updated, remaining: taxonomyRepo.getMissingCoverCount() };
    });
    ipcMain.handle(IPC.TAXONOMY_UP_GROUPS, () => taxonomyRepo.getUpGroups());
    ipcMain.handle(IPC.TAXONOMY_UP_GROUP_TREE, () => taxonomyRepo.getUpGroupTree());
    ipcMain.handle(IPC.TAXONOMY_UP_GROUP_CREATE, (_e, name, color) => taxonomyRepo.createUpGroup(name, color));
    ipcMain.handle(IPC.TAXONOMY_UP_GROUP_RENAME, (_e, id, name) => taxonomyRepo.renameUpGroup(id, name));
    ipcMain.handle(IPC.TAXONOMY_UP_GROUP_REORDER, (_e, ids) => taxonomyRepo.reorderUpGroups(ids));
    ipcMain.handle(IPC.TAXONOMY_UP_GROUP_MEMBERS, (_e, selection) => taxonomyRepo.getUpGroupMemberMids(selection));
    ipcMain.handle(IPC.TAXONOMY_UP_ASSIGNMENT_PATHS, () => taxonomyRepo.getUpAssignmentPaths());
    ipcMain.handle(IPC.TAXONOMY_UP_PORTRAIT_GRAPH, () => readUpPortraitGraph());
    ipcMain.handle(IPC.TAXONOMY_UP_PORTRAIT_REBUILD, () => rebuildUpPortraits());
}
