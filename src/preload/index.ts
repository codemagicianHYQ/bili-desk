import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AiConfig, Theme, UpGroupSelection, UpGroupTreeNode } from '@shared/types'

const api = {
  auth: {
    getQrCode: () => ipcRenderer.invoke(IPC.AUTH_GET_QR),
    pollLogin: (qrcodeKey: string) => ipcRenderer.invoke(IPC.AUTH_POLL, qrcodeKey),
    logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    getStatus: () => ipcRenderer.invoke(IPC.AUTH_STATUS)
  },
  bili: {
    getRecommend: (options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) =>
      options
        ? ipcRenderer.invoke(IPC.BILI_RECOMMEND, options)
        : ipcRenderer.invoke(IPC.BILI_RECOMMEND),
    getVideo: (bvid: string) => ipcRenderer.invoke(IPC.BILI_VIDEO, bvid),
    getPlayUrl: (bvid: string, cid: number, qn?: number) =>
      ipcRenderer.invoke(IPC.BILI_PLAY_URL, bvid, cid, qn),
    getFavFolders: () => ipcRenderer.invoke(IPC.BILI_FAV_FOLDERS),
    getFavResources: (mediaId: number, page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES, mediaId, page)
        : ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES, mediaId),
    getFollowings: (page?: number) =>
      page != null ? ipcRenderer.invoke(IPC.BILI_FOLLOWINGS, page) : ipcRenderer.invoke(IPC.BILI_FOLLOWINGS),
    getFollowTags: () => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAGS),
    getFollowingsInTag: (tagId: number, page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_MEMBERS, tagId, page)
        : ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_MEMBERS, tagId),
    getUserFollowTags: (mid: number) => ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS, mid),
    setUserFollowTags: (mid: number, tagIds: number[]) =>
      ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS_SET, mid, tagIds),
    getUpProfile: (mid: number) => ipcRenderer.invoke(IPC.BILI_UP_PROFILE, mid),
    getUpRelation: (mid: number) => ipcRenderer.invoke(IPC.BILI_UP_RELATION, mid),
    modifyFollow: (mid: number, follow: boolean) =>
      ipcRenderer.invoke(IPC.BILI_UP_MODIFY_FOLLOW, mid, follow),
    getUpVideos: (mid: number, page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_UP_VIDEOS, mid, page)
        : ipcRenderer.invoke(IPC.BILI_UP_VIDEOS, mid),
  },
  taxonomy: {
    getTree: () => ipcRenderer.invoke(IPC.TAXONOMY_TREE),
    createL1: (name: string, icon?: string) =>
      icon
        ? ipcRenderer.invoke(IPC.TAXONOMY_L1_CREATE, name, icon)
        : ipcRenderer.invoke(IPC.TAXONOMY_L1_CREATE, name),
    createL2: (categoryL1Id: number, name: string) =>
      ipcRenderer.invoke(IPC.TAXONOMY_L2_CREATE, categoryL1Id, name),
    createL3: (categoryL2Id: number, name: string) =>
      ipcRenderer.invoke(IPC.TAXONOMY_L3_CREATE, categoryL2Id, name),
    updateCategoryName: (level: 'l1' | 'l2' | 'l3', id: number, name: string) =>
      ipcRenderer.invoke(IPC.TAXONOMY_CATEGORY_UPDATE, level, id, name),
    getFavoriteAssignments: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_ASSIGNMENTS),
    classifyAllFavorites: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_ALL),
    classifyFolderFavorites: (mediaId: number) =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_FOLDER, mediaId),
    getFavTaskStatus: (taskId: number) => ipcRenderer.invoke(IPC.TAXONOMY_FAV_TASK_STATUS, taskId),
    enrichFavoriteCovers: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_ENRICH_COVERS),
    getUpGroups: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUPS),
    getUpGroupTree: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_TREE),
    createUpGroup: (name: string, color?: string) =>
      color
        ? ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_CREATE, name, color)
        : ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_CREATE, name),
    getUpGroupMemberMids: (selection: UpGroupSelection) =>
      ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_MEMBERS, selection),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC.AI_CONFIG_GET),
    setConfig: (config: Partial<AiConfig>) => ipcRenderer.invoke(IPC.AI_CONFIG_SET, config),
    runUpClassification: () => ipcRenderer.invoke(IPC.AI_RUN_UP_CLASSIFY),
    getTaskStatus: (taskId: number) => ipcRenderer.invoke(IPC.AI_TASK_STATUS, taskId)
  },
  app: {
    getTheme: () => ipcRenderer.invoke(IPC.APP_GET_THEME),
    setTheme: (theme: Theme) => ipcRenderer.invoke(IPC.APP_SET_THEME, theme)
  }
}

contextBridge.exposeInMainWorld('biliDesk', api)
