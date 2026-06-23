import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { biliApi } from '../services/bili-api'
import { handleIpc } from './safe-handler'

export function registerBiliIpc(): void {
  ipcMain.handle(IPC.BILI_RECOMMEND, (_e, options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) =>
    biliApi.getRecommend(options)
  )
  ipcMain.handle(IPC.BILI_VIDEO, (_e, bvid: string) => biliApi.getVideo(bvid))
  ipcMain.handle(IPC.BILI_PLAY_URL, (_e, bvid: string, cid: number, qn?: number) =>
    biliApi.getPlayUrl(bvid, cid, qn)
  )
  ipcMain.handle(IPC.BILI_FAV_FOLDERS, () => biliApi.getFavFolders())
  ipcMain.handle(IPC.BILI_FAV_RESOURCES, (_e, mediaId: number, page?: number) =>
    biliApi.getFavResources(mediaId, page)
  )
  ipcMain.handle(IPC.BILI_FOLLOWINGS, (_e, page?: number) => biliApi.getFollowings(page))
  ipcMain.handle(IPC.BILI_FOLLOW_TAGS, () => biliApi.getFollowTags())
  ipcMain.handle(IPC.BILI_FOLLOW_TAG_MEMBERS, (_e, tagId: number, page?: number) =>
    biliApi.getFollowingsInTag(tagId, page)
  )
  ipcMain.handle(IPC.BILI_FOLLOW_USER_TAGS, (_e, mid: number) => biliApi.getUserFollowTags(mid))
  ipcMain.handle(IPC.BILI_FOLLOW_USER_TAGS_SET, (_e, mid: number, tagIds: number[]) =>
    biliApi.setUserFollowTags(mid, tagIds)
  )
  handleIpc(IPC.BILI_UP_PROFILE, (_e, mid: number) => biliApi.getUpProfile(mid))
  handleIpc(IPC.BILI_UP_RELATION, (_e, mid: number) => biliApi.getUpRelation(mid))
  handleIpc(IPC.BILI_UP_MODIFY_FOLLOW, (_e, mid: number, follow: boolean) =>
    biliApi.modifyFollow(mid, follow)
  )
  handleIpc(IPC.BILI_UP_VIDEOS, (_e, mid: number, page?: number) => biliApi.getUpVideos(mid, page))
}
