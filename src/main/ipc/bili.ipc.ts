import { ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import type {
  SearchArticleOrder,
  SearchOrder,
  SearchUserOrder,
  SearchUserTypeFilter,
  UpVideosOrder,
  UserRelationListType,
} from "@shared/types";
import { biliApi } from "../services/bili-api";
import { handleIpc } from "./safe-handler";

export function registerBiliIpc(): void {
  ipcMain.handle(
    IPC.BILI_RECOMMEND,
    (_e, options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) =>
      biliApi.getRecommend(options),
  );
  ipcMain.handle(IPC.BILI_LIVE_RECOMMEND, (_e, page?: number) =>
    biliApi.getLiveRecommend(page),
  );
  ipcMain.handle(IPC.BILI_LIVE_FOLLOWING, () => biliApi.getFollowingLives());
  ipcMain.handle(IPC.BILI_LIVE_ROOM, (_e, roomId: number) =>
    biliApi.getLiveRoom(roomId),
  );
  ipcMain.handle(IPC.BILI_LIVE_PLAY_URL, (_e, roomId: number, qn?: number) =>
    biliApi.getLivePlayUrl(roomId, qn),
  );
  ipcMain.handle(IPC.BILI_VIDEO, (_e, bvid: string) => biliApi.getVideo(bvid));
  ipcMain.handle(
    IPC.BILI_PLAY_URL,
    (
      _e,
      bvid: string,
      cid: number,
      qn?: number,
      options?: { preferMp4?: boolean },
    ) => biliApi.getPlayUrl(bvid, cid, qn, options),
  );
  ipcMain.handle(IPC.BILI_VIDEO_RELATION, (_e, bvid: string, aid: number) =>
    biliApi.getVideoRelation(bvid, aid),
  );
  ipcMain.handle(IPC.BILI_VIDEO_LIKE, (_e, aid: number, like: boolean) =>
    biliApi.likeVideo(aid, like),
  );
  ipcMain.handle(IPC.BILI_VIDEO_COIN, (_e, payload) =>
    biliApi.addCoin(payload),
  );
  ipcMain.handle(IPC.BILI_VIDEO_SHARE, (_e, aid: number, bvid: string) =>
    biliApi.shareVideo(aid, bvid),
  );
  ipcMain.handle(IPC.BILI_WATCH_HEARTBEAT, (_e, payload) =>
    biliApi.reportWatchHeartbeat(payload),
  );
  ipcMain.handle(IPC.BILI_DANMAKU_LIST, (_e, cid: number) =>
    biliApi.getDanmakuList(cid),
  );
  ipcMain.handle(IPC.BILI_DANMAKU_SEND, (_e, payload) =>
    biliApi.sendDanmaku(payload),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_LIST,
    (_e, aid: number, page?: number, sort?: 0 | 1 | 2) =>
      biliApi.getComments(aid, page, sort),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_REPLIES,
    (_e, aid: number, root: number, page?: number) =>
      biliApi.getCommentReplies(aid, root, page),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_ADD,
    (_e, aid: number, message: string, root?: number, parent?: number) =>
      biliApi.addComment(aid, message, root, parent),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_LIKE,
    (_e, aid: number, rpid: number, like: boolean) =>
      biliApi.likeComment(aid, rpid, like),
  );
  ipcMain.handle(IPC.BILI_REPLY_EMOTES, () => biliApi.getReplyEmotes());
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
  ipcMain.handle(
    IPC.BILI_FAV_RESOURCES_REMOVE,
    (_e, mediaId: number, aids: number[]) =>
      biliApi.removeFavResources(mediaId, aids),
  );
  ipcMain.handle(
    IPC.BILI_FAV_RESOURCES_MOVE,
    (_e, srcMediaId: number, tarMediaId: number, aids: number[]) =>
      biliApi.moveFavResources(srcMediaId, tarMediaId, aids),
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
  handleIpc(
    IPC.BILI_USER_RELATION_LIST,
    (_e, mid: number, type: UserRelationListType, page?: number) =>
      biliApi.getUserRelationList(mid, type, page),
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
  handleIpc(
    IPC.BILI_UP_VIDEOS,
    (_e, mid: number, page?: number, order?: UpVideosOrder) =>
      biliApi.getUpVideos(mid, page, order),
  );
  handleIpc(
    IPC.BILI_SEARCH,
    (
      _e,
      keyword: string,
      page?: number,
      order?: SearchOrder,
      apiStartPage?: number,
      pageSize?: number,
    ) => biliApi.searchVideos(keyword, page, order, apiStartPage, pageSize),
  );
  handleIpc(
    IPC.BILI_SEARCH_USERS,
    (
      _e,
      keyword: string,
      page?: number,
      order?: SearchUserOrder,
      userType?: SearchUserTypeFilter,
    ) => biliApi.searchUsers(keyword, page, order, userType),
  );
  handleIpc(
    IPC.BILI_SEARCH_ARTICLES,
    (_e, keyword: string, page?: number, order?: SearchArticleOrder) =>
      biliApi.searchArticles(keyword, page, order),
  );
  handleIpc(IPC.BILI_SEARCH_TYPE_COUNTS, (_e, keyword: string) =>
    biliApi.getSearchTypeCounts(keyword),
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
  handleIpc(
    IPC.BILI_FOLLOW_DYNAMICS,
    (_e, offset?: string, type?: "all" | "video" | "article") =>
      biliApi.getFollowDynamics(offset ?? "", type ?? "all"),
  );
  handleIpc(
    IPC.BILI_WATCH_HISTORY,
    (
      _e,
      type?: "all" | "archive" | "live" | "article",
      cursor?: { max: number; viewAt: number; business: string },
    ) => biliApi.getWatchHistory(type ?? "all", cursor),
  );
  handleIpc(
    IPC.BILI_WATCH_HISTORY_DELETE,
    (_e, item: { business: string; oid: number; kid?: number }) =>
      biliApi.deleteWatchHistory(item),
  );
  handleIpc(IPC.BILI_WATCH_HISTORY_CLEAR, () => biliApi.clearWatchHistory());
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
  handleIpc(IPC.BILI_CHEESE_FOLLOW, (_e, page?: number, mid?: number) =>
    biliApi.getCheeseFollowList(page, mid),
  );
}
