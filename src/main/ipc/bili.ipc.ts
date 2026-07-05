import { ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import type { SearchOrder } from "@shared/types";
import { biliApi } from "../services/bili-api";
import { handleIpc } from "./safe-handler";

export function registerBiliIpc(): void {
  ipcMain.handle(
    IPC.BILI_RECOMMEND,
    (_e, options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) =>
      biliApi.getRecommend(options),
  );
  ipcMain.handle(IPC.BILI_VIDEO, (_e, bvid: string) => biliApi.getVideo(bvid));
  ipcMain.handle(
    IPC.BILI_PLAY_URL,
    (_e, bvid: string, cid: number, qn?: number) =>
      biliApi.getPlayUrl(bvid, cid, qn),
  );
  ipcMain.handle(IPC.BILI_FAV_FOLDERS, () => biliApi.getFavFolders());
  ipcMain.handle(IPC.BILI_VIDEO_FAV_FOLDERS, (_e, aid: number) =>
    biliApi.getVideoFavFolders(aid),
  );
  ipcMain.handle(
    IPC.BILI_VIDEO_FAV_SET,
    (_e, aid: number, addMediaIds: number[], delMediaIds: number[]) =>
      biliApi.setVideoFavFolders(aid, addMediaIds, delMediaIds),
  );
  ipcMain.handle(IPC.BILI_FAV_RESOURCES, (_e, mediaId: number, page?: number) =>
    biliApi.getFavResources(mediaId, page),
  );
  ipcMain.handle(IPC.BILI_FOLLOWINGS, (_e, page?: number) =>
    biliApi.getFollowings(page),
  );
  ipcMain.handle(IPC.BILI_FOLLOW_TAGS, () => biliApi.getFollowTags());
  ipcMain.handle(
    IPC.BILI_FOLLOW_TAG_MEMBERS,
    (_e, tagId: number, page?: number) =>
      biliApi.getFollowingsInTag(tagId, page),
  );
  ipcMain.handle(IPC.BILI_FOLLOW_USER_TAGS, (_e, mid: number) =>
    biliApi.getUserFollowTags(mid),
  );
  ipcMain.handle(
    IPC.BILI_FOLLOW_USER_TAGS_SET,
    (_e, mid: number, tagIds: number[]) =>
      biliApi.setUserFollowTags(mid, tagIds),
  );
  handleIpc(IPC.BILI_UP_PROFILE, (_e, mid: number) =>
    biliApi.getUpProfile(mid),
  );
  handleIpc(IPC.BILI_UP_RELATION, (_e, mid: number) =>
    biliApi.getUpRelation(mid),
  );
  handleIpc(IPC.BILI_UP_MODIFY_FOLLOW, (_e, mid: number, follow: boolean) =>
    biliApi.modifyFollow(mid, follow),
  );
  handleIpc(IPC.BILI_UP_VIDEOS, (_e, mid: number, page?: number) =>
    biliApi.getUpVideos(mid, page),
  );
  handleIpc(
    IPC.BILI_SEARCH,
    (_e, keyword: string, page?: number, order?: SearchOrder) =>
      biliApi.searchVideos(keyword, page, order),
  );
  handleIpc(IPC.BILI_TOVIEW_LIST, () => biliApi.getToViewList());
  handleIpc(IPC.BILI_TOVIEW_ADD, (_e, aid: number, bvid: string) =>
    biliApi.addToView(aid, bvid),
  );
  handleIpc(IPC.BILI_TOVIEW_REMOVE, (_e, aid: number) =>
    biliApi.removeFromToView(aid),
  );
  handleIpc(IPC.BILI_SPACE_DYNAMICS, (_e, mid: number, offset?: string) =>
    biliApi.getSpaceDynamics(mid, offset),
  );
  handleIpc(IPC.BILI_USER_COLLECTIONS, (_e, mid: number, page?: number) =>
    biliApi.getUserCollections(mid, page),
  );
  handleIpc(
    IPC.BILI_SEASON_ARCHIVES,
    (_e, mid: number, seasonId: number, page?: number) =>
      biliApi.getSeasonArchives(mid, seasonId, page),
  );
  handleIpc(IPC.BILI_SERIES_ARCHIVES, (_e, seriesId: number, page?: number) =>
    biliApi.getSeriesArchives(seriesId, page),
  );
  handleIpc(
    IPC.BILI_BANGUMI_FOLLOW,
    (_e, mid: number, type?: 1 | 2, page?: number) =>
      biliApi.getBangumiFollowList(mid, type, page),
  );
  handleIpc(IPC.BILI_SUBSCRIBED_COLLECTIONS, (_e, page?: number) =>
    biliApi.getSubscribedCollections(page),
  );
  handleIpc(IPC.BILI_FAV_VIDEO_MEDIAS, (_e, page?: number) =>
    biliApi.getFavVideoMedias(page),
  );
  handleIpc(IPC.BILI_OPUS_FAVORITES, (_e, page?: number) =>
    biliApi.getOpusFavorites(page),
  );
  handleIpc(IPC.BILI_CHEESE_FOLLOW, (_e, page?: number) =>
    biliApi.getCheeseFollowList(page),
  );
}
