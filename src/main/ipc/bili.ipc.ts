import { BrowserWindow, dialog, ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import type {
  SearchArticleOrder,
  SearchOrder,
  SearchUserOrder,
  SearchUserTypeFilter,
  SearchMediaKind,
  SearchLiveOrder,
  MessageFeedKind,
  MessageSessionFilter,
  RecommendDislikePayload,
  DanmakuCloudConfig,
  SuggestFavFolderPayload,
  ToViewAddResult,
  UpVideosOrder,
  UserRelationListType,
  VideoItem,
  BinaryImageFile,
  ChatShareCard,
  DanmakuFilterKind,
  DynamicPublishOptions,
} from "@shared/types";
import { biliApi } from "../services/bili-api";
import { messageApi } from "../services/message-api";
import { localToViewRepo } from "../db/repositories/local-toview";
import {
  buildFavClassifyText,
  pickClassifyCommentSnippets,
  suggestExistingFavFolderTitle,
} from "../services/fav-classifier";
import {
  clearIntegrityArchive,
  dismissAbnormalFollowing,
  dismissInvalidVideo,
  getIntegrityArchive,
  runIntegrityScan,
} from "../services/integrity-scan";
import {
  clearUpActivityArchive,
  getUpActivityArchive,
  removeUpActivityRecords,
  runUpActivityScan,
} from "../services/up-activity-scan";
import { fetchMediaRange } from "../services/media-proxy";
import { handleIpc } from "./safe-handler";

export function registerBiliIpc(): void {
  ipcMain.handle(
    IPC.BILI_RECOMMEND,
    (_e, options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) =>
      biliApi.getRecommend(options),
  );
  handleIpc(IPC.BILI_POPULAR, (_e, page?: number) =>
    biliApi.getPopularVideos(page ?? 1),
  );
  handleIpc(IPC.BILI_WEEKLY_SERIES_LIST, () => biliApi.getWeeklySeriesList());
  handleIpc(IPC.BILI_WEEKLY_SERIES, (_e, number: number) =>
    biliApi.getWeeklySeries(number),
  );
  handleIpc(IPC.BILI_PRECIOUS, () => biliApi.getPreciousVideos());
  handleIpc(IPC.BILI_RANKING, (_e, rid?: number) =>
    biliApi.getRankingVideos(rid ?? 0),
  );
  handleIpc(IPC.BILI_MUSIC_RANK_PERIODS, () => biliApi.getMusicRankPeriods());
  handleIpc(IPC.BILI_MUSIC_RANK_LIST, (_e, listId: number) =>
    biliApi.getMusicRankList(listId),
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
  handleIpc(IPC.BILI_LIVE_DANMU_INFO, (_e, roomId: number) =>
    biliApi.getLiveDanmuInfo(roomId),
  );
  handleIpc(IPC.BILI_LIVE_DANMU_HISTORY, (_e, roomId: number) =>
    biliApi.getLiveDanmuHistory(roomId),
  );
  handleIpc(IPC.BILI_LIVE_EMOTES, (_e, roomId: number) =>
    biliApi.getLiveEmotes(roomId),
  );
  handleIpc(IPC.BILI_LIVE_DANMU_SEND, (_e, roomId: number, message: string) =>
    biliApi.sendLiveDanmu(roomId, message),
  );
  handleIpc(IPC.BILI_LIVE_ROOM_VIEWERS, (_e, roomId: number, uid?: number) =>
    biliApi.getLiveRoomViewers(roomId, uid),
  );
  ipcMain.handle(IPC.BILI_VIDEO, (_e, bvid: string) => biliApi.getVideo(bvid));
  handleIpc(IPC.BILI_RELATED_VIDEOS, (_e, bvid: string) =>
    biliApi.getRelatedVideos(bvid),
  );
  handleIpc(
    IPC.BILI_VIDEO_ONLINE,
    (_e, aid: number, cid: number, bvid?: string) =>
      biliApi.getVideoOnlineTotal(aid, cid, bvid),
  );
  handleIpc(IPC.BILI_VIDEO_SUBTITLES, (_e, bvid: string, cid: number) =>
    biliApi.getVideoSubtitles(bvid, cid),
  );
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
  ipcMain.handle(
    IPC.BILI_MEDIA_RANGE,
    (_e, url: string, range: string | undefined, referer: string) =>
      fetchMediaRange(url, referer, range),
  );
  ipcMain.handle(IPC.BILI_VIDEO_RELATION, (_e, bvid: string, aid: number) =>
    biliApi.getVideoRelation(bvid, aid),
  );
  ipcMain.handle(IPC.BILI_VIDEO_DISLIKE, (_e, aid: number, dislike: boolean) =>
    biliApi.dislikeVideo(aid, dislike),
  );
  ipcMain.handle(IPC.BILI_VIDEO_HEATMAP, (_e, bvid: string, cid: number) =>
    biliApi.getVideoHeatmap(bvid, cid),
  );
  ipcMain.handle(IPC.BILI_VIDEO_NOTES, (_e, aid: number) =>
    biliApi.getArchiveNotes(aid),
  );
  ipcMain.handle(
    IPC.BILI_VIDEO_NOTE_ADD,
    (_e, aid: number, title: string, text: string) =>
      biliApi.addArchiveNote(aid, title, text),
  );
  ipcMain.handle(
    IPC.BILI_VIDEO_DOWNLOAD,
    async (event, bvid: string, cid: number, qn?: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const picked = await (win
        ? dialog.showSaveDialog(win, {
            defaultPath: `${bvid}.mp4`,
            filters: [{ name: "视频", extensions: ["mp4", "flv"] }],
          })
        : dialog.showSaveDialog({
            defaultPath: `${bvid}.mp4`,
            filters: [{ name: "视频", extensions: ["mp4", "flv"] }],
          }));
      if (picked.canceled || !picked.filePath) return false;
      await biliApi.downloadVideoFile(bvid, cid, picked.filePath, qn);
      return true;
    },
  );
  ipcMain.handle(
    IPC.BILI_SEASON,
    (_e, kind: "bangumi" | "cheese", id: number, by?: "season" | "ep") =>
      biliApi.getSeason(kind, id, by ?? "season"),
  );
  ipcMain.handle(
    IPC.BILI_SEASON_PLAY,
    (_e, kind: "bangumi" | "cheese", epId: number, cid: number, qn?: number) =>
      biliApi.getSeasonPlayUrl(kind, epId, cid, qn),
  );
  ipcMain.handle(
    IPC.BILI_SEASON_FOLLOW,
    (_e, kind: "bangumi" | "cheese", seasonId: number, follow: boolean) =>
      biliApi.setSeasonFollow(kind, seasonId, follow),
  );
  ipcMain.handle(
    IPC.BILI_CHANNEL_VIDEOS,
    (_e, channelId: number, page?: number) =>
      biliApi.getChannelVideos(channelId, page ?? 1),
  );
  ipcMain.handle(IPC.BILI_AUDIO_SONG, (_e, sid: number) =>
    biliApi.getAudioSong(sid),
  );
  ipcMain.handle(
    IPC.BILI_PROFILE_UPDATE,
    (_e, input: { name?: string; sign?: string }) =>
      biliApi.updateMyProfile(input),
  );
  ipcMain.handle(IPC.BILI_PROFILE_FACE, (_e, file: BinaryImageFile) =>
    biliApi.updateMyFace(file),
  );
  ipcMain.handle(IPC.BILI_WALLET, () => biliApi.getWallet());
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
    (
      _e,
      aid: number,
      page?: number,
      sort?: 0 | 1 | 2,
      offset?: string,
      seekRpid?: number,
    ) => biliApi.getComments(aid, page, sort, offset ?? "", seekRpid ?? 0),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_REPLIES,
    (_e, aid: number, root: number, page?: number) =>
      biliApi.getCommentReplies(aid, root, page),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_ADD,
    (
      _e,
      aid: number,
      message: string,
      root?: number,
      parent?: number,
      images?: BinaryImageFile[],
    ) => biliApi.addComment(aid, message, root, parent, images),
  );
  ipcMain.handle(
    IPC.BILI_COMMENT_LIKE,
    (_e, aid: number, rpid: number, like: boolean) =>
      biliApi.likeComment(aid, rpid, like),
  );
  handleIpc(
    IPC.BILI_COMMENT_HATE,
    (_e, oid: string, type: number, rpid: number | string, hate: boolean) =>
      biliApi.hateComment(oid, type, rpid, hate),
  );
  handleIpc(
    IPC.BILI_COMMENT_DELETE,
    (_e, oid: string, type: number, rpid: number | string) =>
      biliApi.deleteReply(oid, type, rpid),
  );
  handleIpc(
    IPC.BILI_COMMENT_PIN,
    (_e, oid: string, type: number, rpid: number, pin: boolean) =>
      biliApi.pinComment(oid, type, rpid, pin),
  );
  handleIpc(
    IPC.BILI_COMMENT_REPORT,
    (_e, oid: string, type: number, rpid: number | string, reason: number) =>
      biliApi.reportComment(oid, type, rpid, reason),
  );
  ipcMain.handle(IPC.BILI_REPLY_EMOTES, () => biliApi.getReplyEmotes());
  ipcMain.handle(IPC.BILI_FAV_FOLDERS, () => biliApi.getFavFolders());
  ipcMain.handle(
    IPC.BILI_FAV_FOLDER_CREATE,
    (_e, payload: { title: string; intro?: string; privacy?: 0 | 1 }) =>
      biliApi.createFavFolder(payload),
  );
  ipcMain.handle(IPC.BILI_FAV_FOLDER_INFO, (_e, mediaId: number) =>
    biliApi.getFavFolderInfo(mediaId),
  );
  ipcMain.handle(
    IPC.BILI_FAV_FOLDER_EDIT,
    (
      _e,
      payload: {
        mediaId: number;
        title: string;
        intro?: string;
        privacy?: 0 | 1;
      },
    ) => biliApi.editFavFolder(payload),
  );
  ipcMain.handle(IPC.BILI_FAV_FOLDER_DELETE, (_e, mediaId: number) =>
    biliApi.deleteFavFolder(mediaId),
  );
  ipcMain.handle(IPC.BILI_FAV_FOLDER_SORT, (_e, mediaIds: number[]) =>
    biliApi.sortFavFolders(mediaIds),
  );
  ipcMain.handle(IPC.BILI_VIDEO_FAV_FOLDERS, (_e, aid: number) =>
    biliApi.getVideoFavFolders(aid),
  );
  ipcMain.handle(
    IPC.BILI_FAV_FOLDER_SUGGEST,
    async (_e, payload: SuggestFavFolderPayload) => {
      let comments = "";
      const aid = Number(payload?.aid);
      if (Number.isFinite(aid) && aid > 0) {
        try {
          const texts = await biliApi.getHotCommentTexts(aid, 8);
          comments = pickClassifyCommentSnippets(texts);
        } catch {
          comments = "";
        }
      }
      const text = buildFavClassifyText({
        title: payload?.title ?? "",
        intro: payload?.intro,
        upper: { name: payload?.ownerName },
        comments,
      });
      const title = suggestExistingFavFolderTitle(
        text,
        payload?.folderTitles ?? [],
      );
      return title ? { title } : null;
    },
  );
  ipcMain.handle(
    IPC.BILI_VIDEO_FAV_SET,
    (_e, aid: number, addMediaIds: number[], delMediaIds: number[]) =>
      biliApi.setVideoFavFolders(aid, addMediaIds, delMediaIds),
  );
  ipcMain.handle(
    IPC.BILI_FAV_RESOURCES,
    (
      _e,
      mediaId: number,
      page?: number,
      riskRetry?: "short" | "long",
      expectedCount?: number,
    ) =>
      biliApi.getFavResources(
        mediaId,
        page ?? 1,
        20,
        riskRetry === "long" ? "long" : "short",
        Number(expectedCount) || 0,
      ),
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
  ipcMain.handle(IPC.BILI_FAV_RESOURCES_CLEAN, (_e, mediaId: number) =>
    biliApi.cleanFavResources(mediaId),
  );
  ipcMain.handle(IPC.BILI_FOLLOWINGS, (_e, page?: number) =>
    biliApi.getFollowings(page),
  );
  ipcMain.handle(IPC.BILI_FOLLOW_TAGS, () => biliApi.getFollowTags());
  ipcMain.handle(IPC.BILI_FOLLOW_TAG_CREATE, (_e, name: string) =>
    biliApi.createFollowTag(name),
  );
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
  handleIpc(IPC.BILI_UP_MODIFY_SPECIAL, (_e, mid: number, special: boolean) =>
    biliApi.modifySpecialFollow(mid, special),
  );
  handleIpc(IPC.BILI_BLACKLIST, (_e, page?: number) =>
    biliApi.getBlacklist(page ?? 1),
  );
  handleIpc(IPC.BILI_UP_MODIFY_BLOCK, (_e, mid: number, block: boolean) =>
    biliApi.modifyBlock(mid, block),
  );
  handleIpc(
    IPC.BILI_UP_VIDEOS,
    (_e, mid: number, page?: number, order?: UpVideosOrder, keyword?: string) =>
      biliApi.getUpVideos(mid, page, order, keyword ?? ""),
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
  handleIpc(
    IPC.BILI_SEARCH_MEDIA,
    (_e, keyword: string, kind: SearchMediaKind, page?: number) =>
      biliApi.searchMedia(keyword, kind, page),
  );
  handleIpc(
    IPC.BILI_SEARCH_LIVE,
    (_e, keyword: string, page?: number, order?: SearchLiveOrder) =>
      biliApi.searchLiveRooms(keyword, page, order),
  );
  handleIpc(IPC.BILI_SEARCH_SUGGEST, (_e, term: string) =>
    biliApi.getSearchSuggest(term),
  );
  handleIpc(IPC.BILI_SEARCH_TYPE_COUNTS, (_e, keyword: string) =>
    biliApi.getSearchTypeCounts(keyword),
  );
  handleIpc(IPC.BILI_TOVIEW_LIST, () => biliApi.getToViewList());
  handleIpc(
    IPC.BILI_TOVIEW_ADD,
    async (
      _e,
      aid: number,
      bvid: string,
      video?: VideoItem,
      forceLocal?: boolean,
    ): Promise<ToViewAddResult> => {
      const aidNum = Number(aid) || 0;
      const bvidStr = String(bvid ?? "").trim();
      if (!bvidStr) throw new Error("缺少视频信息，无法加入稍后再看");

      if (forceLocal) {
        return {
          source: "local",
          item: localToViewRepo.add(video, aidNum, bvidStr),
        };
      }

      try {
        await biliApi.addToView(aidNum, bvidStr);
        localToViewRepo.remove(bvidStr);
        return { source: "official" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("TOVIEW_FULL")) {
          return {
            source: "local",
            item: localToViewRepo.add(video, aidNum, bvidStr),
          };
        }
        throw error;
      }
    },
  );
  handleIpc(IPC.BILI_TOVIEW_REMOVE, (_e, aid: number) =>
    biliApi.removeFromToView(aid),
  );
  handleIpc(IPC.BILI_TOVIEW_CLEAR, () => biliApi.clearToView());
  handleIpc(IPC.BILI_TOVIEW_LOCAL_LIST, async () => {
    const videos = localToViewRepo.list();
    return { videos, count: videos.length };
  });
  handleIpc(
    IPC.BILI_TOVIEW_LOCAL_REMOVE,
    async (_e, bvid: string | string[]) => {
      if (Array.isArray(bvid)) {
        localToViewRepo.removeMany(bvid.map((item) => String(item ?? "")));
        return;
      }
      localToViewRepo.remove(String(bvid ?? ""));
    },
  );
  handleIpc(IPC.BILI_INTEGRITY_ARCHIVE, async () => getIntegrityArchive());
  ipcMain.handle(IPC.BILI_INTEGRITY_CLEAR, (_e, scope?: string) => {
    const next =
      scope === "favorites" || scope === "toview" || scope === "following"
        ? scope
        : undefined;
    return clearIntegrityArchive(next);
  });
  ipcMain.handle(IPC.BILI_INTEGRITY_DISMISS_VIDEO, (_e, id: string) =>
    dismissInvalidVideo(String(id ?? "")),
  );
  ipcMain.handle(IPC.BILI_INTEGRITY_DISMISS_FOLLOWING, (_e, mid: number) =>
    dismissAbnormalFollowing(Number(mid) || 0),
  );
  ipcMain.handle(IPC.BILI_INTEGRITY_SCAN, async (event, scope?: string) => {
    const next =
      scope === "toview" || scope === "following" || scope === "favorites"
        ? scope
        : "favorites";
    return runIntegrityScan(next, (progress) => {
      try {
        event.sender.send(IPC.BILI_INTEGRITY_PROGRESS, progress);
      } catch {
        // sender may be gone
      }
    });
  });
  handleIpc(IPC.BILI_UP_ACTIVITY_ARCHIVE, async () => getUpActivityArchive());
  ipcMain.handle(IPC.BILI_UP_ACTIVITY_CLEAR, () => clearUpActivityArchive());
  handleIpc(IPC.BILI_UP_ACTIVITY_REMOVE, (_e, mids: number[]) =>
    removeUpActivityRecords(Array.isArray(mids) ? mids : []),
  );
  ipcMain.handle(IPC.BILI_UP_ACTIVITY_SCAN, async (event) => {
    return runUpActivityScan((progress) => {
      try {
        event.sender.send(IPC.BILI_UP_ACTIVITY_PROGRESS, progress);
      } catch {
        // sender may be gone
      }
    });
  });
  handleIpc(IPC.BILI_SPACE_DYNAMICS, (_e, mid: number, offset?: string) =>
    biliApi.getSpaceDynamics(mid, offset),
  );
  handleIpc(IPC.BILI_SPACE_OPUS, (_e, mid: number, offset?: string) =>
    biliApi.getSpaceOpus(mid, offset),
  );
  handleIpc(
    IPC.BILI_FOLLOW_DYNAMICS,
    (_e, offset?: string, type?: "all" | "video" | "article") =>
      biliApi.getFollowDynamics(offset ?? "", type ?? "all"),
  );
  handleIpc(IPC.BILI_DYNAMIC_DETAIL, (_e, id: string) =>
    biliApi.getDynamicDetail(id),
  );
  handleIpc(IPC.BILI_DYNAMIC_LIKE, (_e, id: string, like: boolean) =>
    biliApi.likeDynamic(id, like),
  );
  handleIpc(IPC.BILI_DYNAMIC_FAV, (_e, id: string, favorite: boolean) =>
    biliApi.favoriteDynamic(id, favorite),
  );
  handleIpc(IPC.BILI_DYNAMIC_TOP, (_e, id: string, top: boolean) =>
    biliApi.setDynamicTop(id, top),
  );
  handleIpc(IPC.BILI_DYNAMIC_REMOVE, (_e, id: string) =>
    biliApi.removeDynamic(id),
  );
  handleIpc(
    IPC.BILI_DYNAMIC_REPORT,
    (_e, id: string, accusedUid: number, reasonType: number) =>
      biliApi.reportDynamic(id, accusedUid, reasonType),
  );
  handleIpc(IPC.BILI_DYNAMIC_EQUIP_CARD, (_e, itemId: number) =>
    biliApi.equipDynamicCard(itemId),
  );
  handleIpc(
    IPC.BILI_DYNAMIC_CREATE,
    (
      _e,
      text: string,
      images?: BinaryImageFile[],
      options?: DynamicPublishOptions,
    ) => biliApi.createDynamic(text, images, options),
  );
  handleIpc(
    IPC.BILI_DYNAMIC_EDIT,
    (
      _e,
      id: string,
      text: string,
      images?: BinaryImageFile[],
      options?: DynamicPublishOptions,
    ) => biliApi.editDynamic(id, text, images, options),
  );
  handleIpc(IPC.BILI_DYNAMIC_PRIVATE, (_e, id: string, privatePub: boolean) =>
    biliApi.setDynamicPrivate(id, privatePub),
  );
  handleIpc(IPC.BILI_TOPIC_SEARCH, (_e, keyword: string) =>
    biliApi.searchTopics(keyword),
  );
  handleIpc(IPC.BILI_TOPIC_HEAD, (_e, topicId: number) =>
    biliApi.getTopicHead(topicId),
  );
  handleIpc(IPC.BILI_TOPIC_FAV, (_e, topicId: number, favorite: boolean) =>
    biliApi.favoriteTopic(topicId, favorite),
  );
  handleIpc(IPC.BILI_DYNAMIC_REPOST, (_e, id: string, text?: string) =>
    biliApi.repostDynamic(id, text ?? ""),
  );
  handleIpc(IPC.BILI_HOT_SEARCH, () => biliApi.getHotSearch());
  handleIpc(IPC.BILI_TOPIC_FEED, (_e, topicId: number, offset?: string) =>
    biliApi.getTopicDynamics(topicId, offset ?? ""),
  );
  handleIpc(IPC.BILI_VIDEO_CHAPTERS, (_e, bvid: string, cid: number) =>
    biliApi.getVideoChapters(bvid, cid),
  );
  handleIpc(IPC.BILI_VIDEO_TRIPLE, (_e, aid: number, bvid: string) =>
    biliApi.tripleVideo(aid, bvid),
  );
  handleIpc(
    IPC.BILI_VIDEO_AI_SUMMARY,
    (_e, bvid: string, cid: number, upMid: number) =>
      biliApi.getVideoAiSummary(bvid, cid, upMid),
  );
  handleIpc(
    IPC.BILI_RECOMMEND_DISLIKE,
    (_e, payload: RecommendDislikePayload) => biliApi.dislikeRecommend(payload),
  );
  handleIpc(IPC.BILI_MENTION_SUGGEST, (_e, keyword: string) =>
    biliApi.getMentionSuggest(keyword),
  );
  handleIpc(IPC.BILI_DM_HISTORY_DATES, (_e, cid: number, month: string) =>
    biliApi.getDanmakuHistoryDates(cid, month),
  );
  handleIpc(IPC.BILI_DM_HISTORY, (_e, cid: number, date: string) =>
    biliApi.getDanmakuHistory(cid, date),
  );
  handleIpc(IPC.BILI_DM_CLOUD_CONFIG, (_e, config: DanmakuCloudConfig) =>
    biliApi.syncDanmakuConfig(config),
  );
  handleIpc(IPC.BILI_VIDEO_SNAPSHOT, (_e, bvid: string, cid: number) =>
    biliApi.getVideoSnapshot(bvid, cid),
  );
  handleIpc(IPC.BILI_VIP_CENTER, () => biliApi.getVipCenter());
  handleIpc(IPC.BILI_VIP_EXPERIENCE, () => biliApi.claimVipExperience());
  handleIpc(IPC.BILI_VIP_PRIVILEGES, () => biliApi.getVipPrivileges());
  handleIpc(IPC.BILI_VIP_PRIVILEGE_RECEIVE, (_e, type: number) =>
    biliApi.receiveVipPrivilege(type),
  );
  handleIpc(IPC.BILI_EXP_REWARD, () => biliApi.getExpReward());
  handleIpc(IPC.BILI_COIN_LOG, () => biliApi.getCoinLog());
  handleIpc(IPC.BILI_EXP_LOG, () => biliApi.getExpLog());
  handleIpc(IPC.BILI_LIVE_SIGN_INFO, () => biliApi.getLiveSignInfo());
  handleIpc(IPC.BILI_LIVE_SIGN, () => biliApi.doLiveSign());
  handleIpc(IPC.BILI_FANS_MEDALS, (_e, page: number) =>
    biliApi.getFansMedals(page),
  );
  handleIpc(IPC.BILI_FANS_MEDAL_WEAR, (_e, medalId: number | null) =>
    biliApi.wearFansMedal(medalId),
  );
  handleIpc(IPC.BILI_DM_FILTERS, () => biliApi.getDanmakuFilters());
  handleIpc(
    IPC.BILI_DM_FILTER_ADD,
    (_e, text: string, kind?: DanmakuFilterKind) =>
      biliApi.addDanmakuFilter(text, kind ?? "text"),
  );
  handleIpc(IPC.BILI_DM_RECALL, (_e, cid: number, dmid: string) =>
    biliApi.recallDanmaku(cid, dmid),
  );
  handleIpc(IPC.BILI_DM_FILTER_DEL, (_e, id: number) =>
    biliApi.removeDanmakuFilter(id),
  );
  handleIpc(IPC.BILI_DM_LIKE, (_e, cid: number, dmid: string, like: boolean) =>
    biliApi.likeDanmaku(cid, dmid, like),
  );
  handleIpc(
    IPC.BILI_DM_REPORT,
    (_e, cid: number, dmid: string, reason?: number) =>
      biliApi.reportDanmaku(cid, dmid, reason ?? 11),
  );
  handleIpc(IPC.BILI_ARTICLE_VIEW, (_e, id: number) => biliApi.getArticle(id));
  handleIpc(IPC.BILI_ARTICLE_LIKE, (_e, id: number, like: boolean) =>
    biliApi.likeArticle(id, like),
  );
  handleIpc(
    IPC.BILI_ARTICLE_COIN,
    (_e, id: number, upMid: number, multiply?: 1 | 2) =>
      biliApi.coinArticle(id, upMid, multiply ?? 1),
  );
  handleIpc(IPC.BILI_ARTICLE_FAV, (_e, id: number, favorite: boolean) =>
    biliApi.favoriteArticle(id, favorite),
  );
  handleIpc(
    IPC.BILI_TARGET_COMMENT_LIST,
    (
      _e,
      oid: string,
      type: number,
      page?: number,
      sort?: 0 | 1 | 2,
      offset?: string,
      seekRpid?: number,
    ) =>
      biliApi.getTargetComments(
        oid,
        type,
        page ?? 1,
        sort ?? 0,
        offset ?? "",
        seekRpid ?? 0,
      ),
  );
  handleIpc(
    IPC.BILI_TARGET_COMMENT_REPLIES,
    (_e, oid: string, type: number, root: number, page?: number) =>
      biliApi.getTargetCommentReplies(oid, type, root, page ?? 1),
  );
  handleIpc(
    IPC.BILI_TARGET_COMMENT_ADD,
    (
      _e,
      oid: string,
      type: number,
      message: string,
      root?: number,
      parent?: number,
      images?: BinaryImageFile[],
    ) =>
      biliApi.addTargetComment(
        oid,
        type,
        message,
        root ?? 0,
        parent ?? 0,
        images,
      ),
  );
  handleIpc(
    IPC.BILI_TARGET_COMMENT_LIKE,
    (_e, oid: string, type: number, rpid: number, like: boolean) =>
      biliApi.likeTargetComment(oid, type, rpid, like),
  );
  handleIpc(
    IPC.BILI_WATCH_HISTORY,
    (
      _e,
      type?: "all" | "archive" | "live" | "article",
      cursor?: { max: number; viewAt: number; business: string },
      filters?: {
        keyword?: string;
        page?: number;
        duration?: 0 | 1 | 2 | 3 | 4;
        device?: "all" | "pc" | "phone" | "pad" | "tv";
        fromTime?: number;
        toTime?: number;
      },
    ) => biliApi.getWatchHistory(type ?? "all", cursor, filters),
  );
  handleIpc(
    IPC.BILI_WATCH_HISTORY_DELETE,
    (_e, item: { business: string; oid: number; kid?: number }) =>
      biliApi.deleteWatchHistory(item),
  );
  handleIpc(IPC.BILI_WATCH_HISTORY_CLEAR, () => biliApi.clearWatchHistory());
  handleIpc(IPC.BILI_HISTORY_SHADOW_GET, () => biliApi.getHistoryShadow());
  handleIpc(IPC.BILI_HISTORY_SHADOW_SET, (_e, record: boolean) =>
    biliApi.setHistoryShadow(record),
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
  handleIpc(IPC.BILI_UGC_SEASON_SUBSCRIBED, (_e, seasonId: number) =>
    biliApi.getUgcSeasonSubscribed(seasonId),
  );
  handleIpc(
    IPC.BILI_UGC_SEASON_SUBSCRIBE_SET,
    (_e, seasonId: number, subscribe: boolean) =>
      biliApi.setUgcSeasonSubscribe(seasonId, subscribe),
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
  handleIpc(IPC.BILI_UPOWER_PAID, () => biliApi.getUpowerPaidList());
  handleIpc(IPC.BILI_MSG_UNREAD, () => messageApi.getUnread());
  handleIpc(
    IPC.BILI_MSG_SESSIONS,
    (_e, filter?: MessageSessionFilter, endTs?: number) =>
      messageApi.getSessions(filter ?? "all", endTs ?? 0),
  );
  handleIpc(
    IPC.BILI_MSG_CHAT,
    (_e, talkerId: string, sessionType: number, endSeqno?: string) =>
      messageApi.getChat(talkerId, sessionType, endSeqno ?? ""),
  );
  handleIpc(
    IPC.BILI_MSG_SEND,
    (_e, talkerId: string, sessionType: number, text: string) =>
      messageApi.sendChat(talkerId, sessionType, text),
  );
  handleIpc(
    IPC.BILI_MSG_SEND_IMAGE,
    (
      _e,
      talkerId: string,
      sessionType: number,
      file: { name: string; mime: string; data: Uint8Array },
    ) => messageApi.sendChatImage(talkerId, sessionType, file),
  );
  handleIpc(
    IPC.BILI_MSG_SEND_SHARE,
    (_e, talkerId: string, sessionType: number, card: ChatShareCard) =>
      messageApi.sendChatShare(talkerId, sessionType, card),
  );
  handleIpc(
    IPC.BILI_MSG_READ,
    (_e, talkerId: string, sessionType: number, ackSeqno?: string) =>
      messageApi.markRead(talkerId, sessionType, ackSeqno ?? ""),
  );
  handleIpc(
    IPC.BILI_MSG_SESSION_TOP,
    (_e, talkerId: string, sessionType: number, pinned: boolean) =>
      messageApi.setPinned(talkerId, sessionType, pinned),
  );
  handleIpc(
    IPC.BILI_MSG_SESSION_DND,
    (_e, talkerId: string, sessionType: number, muted: boolean) =>
      messageApi.setMuted(talkerId, sessionType, muted),
  );
  handleIpc(
    IPC.BILI_MSG_SESSION_REMOVE,
    (_e, talkerId: string, sessionType: number) =>
      messageApi.removeSession(talkerId, sessionType),
  );
  handleIpc(
    IPC.BILI_MSG_RECALL,
    (_e, talkerId: string, sessionType: number, msgKey: string) =>
      messageApi.recall(talkerId, sessionType, msgKey),
  );
  handleIpc(
    IPC.BILI_MSG_FEED,
    (_e, kind: MessageFeedKind, cursorId?: number, cursorTime?: number) =>
      messageApi.getFeed(kind, cursorId ?? 0, cursorTime ?? 0),
  );
  handleIpc(IPC.BILI_MSG_FEED_DELETE, (_e, kind: MessageFeedKind, id: string) =>
    messageApi.deleteFeed(kind, id),
  );
  handleIpc(
    IPC.BILI_MSG_MY_REPLIES,
    (_e, cursorId?: number, cursorTime?: number, keyword?: string) =>
      messageApi.getMyReplies(cursorId ?? 0, cursorTime ?? 0, keyword ?? ""),
  );
  handleIpc(IPC.BILI_MSG_NOTICES, (_e, cursor?: string) =>
    messageApi.getNotices(cursor ?? ""),
  );
  handleIpc(IPC.BILI_MSG_SETTINGS_GET, () => messageApi.getSettings());
  handleIpc(IPC.BILI_MSG_SETTINGS_SET, (_e, patch) =>
    messageApi.setSettings(patch ?? {}),
  );
  handleIpc(IPC.BILI_MSG_BLOCK_ADD, (_e, word: string) =>
    messageApi.addBlockWord(word),
  );
  handleIpc(IPC.BILI_MSG_BLOCK_DEL, (_e, word: string) =>
    messageApi.removeBlockWord(word),
  );
}
