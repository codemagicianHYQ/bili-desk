import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc-channels";
import type {
  AiConfig,
  SearchArticleOrder,
  SearchOrder,
  SearchUserOrder,
  SearchUserTypeFilter,
  AddCoinPayload,
  SendDanmakuPayload,
  WatchHeartbeatPayload,
  Theme,
  DynamicFeedType,
  HistoryCursor,
  HistoryFeedType,
  UpGroupSelection,
  UpGroupTreeNode,
  UpVideosOrder,
} from "@shared/types";

const api = {
  auth: {
    getQrCode: () => ipcRenderer.invoke(IPC.AUTH_GET_QR),
    pollLogin: (qrcodeKey: string) =>
      ipcRenderer.invoke(IPC.AUTH_POLL, qrcodeKey),
    logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    getStatus: () => ipcRenderer.invoke(IPC.AUTH_STATUS),
  },
  bili: {
    getRecommend: (options?: {
      freshIdx?: number;
      freshIdx1h?: number;
      ps?: number;
    }) =>
      options
        ? ipcRenderer.invoke(IPC.BILI_RECOMMEND, options)
        : ipcRenderer.invoke(IPC.BILI_RECOMMEND),
    getLiveRecommend: (page?: number) =>
      page == null
        ? ipcRenderer.invoke(IPC.BILI_LIVE_RECOMMEND)
        : ipcRenderer.invoke(IPC.BILI_LIVE_RECOMMEND, page),
    getFollowingLives: () => ipcRenderer.invoke(IPC.BILI_LIVE_FOLLOWING),
    getLiveRoom: (roomId: number) =>
      ipcRenderer.invoke(IPC.BILI_LIVE_ROOM, roomId),
    getLivePlayUrl: (roomId: number, qn?: number) =>
      qn == null
        ? ipcRenderer.invoke(IPC.BILI_LIVE_PLAY_URL, roomId)
        : ipcRenderer.invoke(IPC.BILI_LIVE_PLAY_URL, roomId, qn),
    getVideo: (bvid: string) => ipcRenderer.invoke(IPC.BILI_VIDEO, bvid),
    getPlayUrl: (bvid: string, cid: number, qn?: number) =>
      ipcRenderer.invoke(IPC.BILI_PLAY_URL, bvid, cid, qn),
    getVideoRelation: (bvid: string, aid: number) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_RELATION, bvid, aid),
    likeVideo: (aid: number, like: boolean) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_LIKE, aid, like),
    addCoin: (payload: AddCoinPayload) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_COIN, payload),
    shareVideo: (aid: number, bvid: string) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_SHARE, aid, bvid),
    reportWatchHeartbeat: (payload: WatchHeartbeatPayload) =>
      ipcRenderer.invoke(IPC.BILI_WATCH_HEARTBEAT, payload),
    getDanmakuList: (cid: number) =>
      ipcRenderer.invoke(IPC.BILI_DANMAKU_LIST, cid),
    sendDanmaku: (payload: SendDanmakuPayload) =>
      ipcRenderer.invoke(IPC.BILI_DANMAKU_SEND, payload),
    getComments: (aid: number, page?: number, sort?: 0 | 1 | 2) =>
      ipcRenderer.invoke(IPC.BILI_COMMENT_LIST, aid, page ?? 1, sort ?? 0),
    getCommentReplies: (aid: number, root: number, page?: number) =>
      ipcRenderer.invoke(IPC.BILI_COMMENT_REPLIES, aid, root, page ?? 1),
    addComment: (
      aid: number,
      message: string,
      root?: number,
      parent?: number,
    ) =>
      ipcRenderer.invoke(
        IPC.BILI_COMMENT_ADD,
        aid,
        message,
        root ?? 0,
        parent ?? 0,
      ),
    likeComment: (aid: number, rpid: number, like: boolean) =>
      ipcRenderer.invoke(IPC.BILI_COMMENT_LIKE, aid, rpid, like),
    getReplyEmotes: () => ipcRenderer.invoke(IPC.BILI_REPLY_EMOTES),
    getFavFolders: () => ipcRenderer.invoke(IPC.BILI_FAV_FOLDERS),
    getVideoFavFolders: (aid: number) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_FAV_FOLDERS, aid),
    setVideoFavFolders: (
      aid: number,
      addMediaIds: number[],
      delMediaIds: number[],
    ) =>
      ipcRenderer.invoke(IPC.BILI_VIDEO_FAV_SET, aid, addMediaIds, delMediaIds),
    getFavResources: (mediaId: number, page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES, mediaId, page)
        : ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES, mediaId),
    removeFavResources: (mediaId: number, aids: number[]) =>
      ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES_REMOVE, mediaId, aids),
    moveFavResources: (
      srcMediaId: number,
      tarMediaId: number,
      aids: number[],
    ) =>
      ipcRenderer.invoke(
        IPC.BILI_FAV_RESOURCES_MOVE,
        srcMediaId,
        tarMediaId,
        aids,
      ),
    getFollowings: (page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_FOLLOWINGS, page)
        : ipcRenderer.invoke(IPC.BILI_FOLLOWINGS),
    getFollowTags: () => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAGS),
    getFollowingsInTag: (tagId: number, page?: number) =>
      page != null
        ? ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_MEMBERS, tagId, page)
        : ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_MEMBERS, tagId),
    getUserRelationList: (
      mid: number,
      type: "followings" | "followers",
      page?: number,
    ) => ipcRenderer.invoke(IPC.BILI_USER_RELATION_LIST, mid, type, page ?? 1),
    getUserFollowTags: (mid: number) =>
      ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS, mid),
    setUserFollowTags: (mid: number, tagIds: number[]) =>
      ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS_SET, mid, tagIds),
    getUpProfile: (mid: number) => ipcRenderer.invoke(IPC.BILI_UP_PROFILE, mid),
    getUpRelation: (mid: number) =>
      ipcRenderer.invoke(IPC.BILI_UP_RELATION, mid),
    modifyFollow: (mid: number, follow: boolean) =>
      ipcRenderer.invoke(IPC.BILI_UP_MODIFY_FOLLOW, mid, follow),
    getUpVideos: (mid: number, page?: number, order?: UpVideosOrder) =>
      ipcRenderer.invoke(
        IPC.BILI_UP_VIDEOS,
        mid,
        page ?? 1,
        order ?? "pubdate",
      ),
    searchVideos: (
      keyword: string,
      page?: number,
      order?: SearchOrder,
      apiStartPage?: number,
      pageSize?: number,
    ) =>
      ipcRenderer.invoke(
        IPC.BILI_SEARCH,
        keyword,
        page ?? 1,
        order,
        apiStartPage ?? 1,
        pageSize ?? 30,
      ),
    searchUsers: (
      keyword: string,
      page?: number,
      order?: SearchUserOrder,
      userType?: SearchUserTypeFilter,
    ) =>
      ipcRenderer.invoke(
        IPC.BILI_SEARCH_USERS,
        keyword,
        page ?? 1,
        order,
        userType ?? 0,
      ),
    searchArticles: (
      keyword: string,
      page?: number,
      order?: SearchArticleOrder,
    ) =>
      ipcRenderer.invoke(
        IPC.BILI_SEARCH_ARTICLES,
        keyword,
        page ?? 1,
        order ?? "totalrank",
      ),
    getSearchTypeCounts: (keyword: string) =>
      ipcRenderer.invoke(IPC.BILI_SEARCH_TYPE_COUNTS, keyword),
    getToViewList: () => ipcRenderer.invoke(IPC.BILI_TOVIEW_LIST),
    addToView: (aid: number, bvid: string) =>
      ipcRenderer.invoke(IPC.BILI_TOVIEW_ADD, aid, bvid),
    removeFromToView: (aid: number) =>
      ipcRenderer.invoke(IPC.BILI_TOVIEW_REMOVE, aid),
    getSpaceDynamics: (mid: number, offset?: string) =>
      ipcRenderer.invoke(IPC.BILI_SPACE_DYNAMICS, mid, offset ?? ""),
    getFollowDynamics: (offset?: string, type?: DynamicFeedType) =>
      ipcRenderer.invoke(IPC.BILI_FOLLOW_DYNAMICS, offset ?? "", type ?? "all"),
    getWatchHistory: (type?: HistoryFeedType, cursor?: HistoryCursor) =>
      ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY, type ?? "all", cursor),
    deleteWatchHistory: (item: {
      business: string;
      oid: number;
      kid?: number;
    }) => ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY_DELETE, item),
    clearWatchHistory: () => ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY_CLEAR),
    getUserCollections: (mid: number, page?: number) =>
      ipcRenderer.invoke(IPC.BILI_USER_COLLECTIONS, mid, page ?? 1),
    getSeasonArchives: (mid: number, seasonId: number, page?: number) =>
      ipcRenderer.invoke(IPC.BILI_SEASON_ARCHIVES, mid, seasonId, page ?? 1),
    getSeriesArchives: (seriesId: number, page?: number) =>
      ipcRenderer.invoke(IPC.BILI_SERIES_ARCHIVES, seriesId, page ?? 1),
    getBangumiFollowList: (mid: number, type?: 1 | 2, page?: number) =>
      ipcRenderer.invoke(IPC.BILI_BANGUMI_FOLLOW, mid, type ?? 1, page ?? 1),
    getSubscribedCollections: (page?: number) =>
      ipcRenderer.invoke(IPC.BILI_SUBSCRIBED_COLLECTIONS, page ?? 1),
    getFavVideoMedias: (page?: number) =>
      ipcRenderer.invoke(IPC.BILI_FAV_VIDEO_MEDIAS, page ?? 1),
    getOpusFavorites: (page?: number) =>
      ipcRenderer.invoke(IPC.BILI_OPUS_FAVORITES, page ?? 1),
    getCheeseFollowList: (page?: number, mid?: number) =>
      ipcRenderer.invoke(IPC.BILI_CHEESE_FOLLOW, page ?? 1, mid),
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
    updateCategoryName: (level: "l1" | "l2" | "l3", id: number, name: string) =>
      ipcRenderer.invoke(IPC.TAXONOMY_CATEGORY_UPDATE, level, id, name),
    getFavoriteAssignments: () =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_ASSIGNMENTS),
    classifyAllFavorites: () =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_ALL),
    classifyFolderFavorites: (mediaId: number) =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_FOLDER, mediaId),
    getFavTaskStatus: (taskId: number) =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_TASK_STATUS, taskId),
    enrichFavoriteCovers: () =>
      ipcRenderer.invoke(IPC.TAXONOMY_FAV_ENRICH_COVERS),
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
    setConfig: (config: Partial<AiConfig>) =>
      ipcRenderer.invoke(IPC.AI_CONFIG_SET, config),
    runUpClassification: () => ipcRenderer.invoke(IPC.AI_RUN_UP_CLASSIFY),
    getTaskStatus: (taskId: number) =>
      ipcRenderer.invoke(IPC.AI_TASK_STATUS, taskId),
  },
  app: {
    getTheme: () => ipcRenderer.invoke(IPC.APP_GET_THEME),
    setTheme: (theme: Theme) => ipcRenderer.invoke(IPC.APP_SET_THEME, theme),
  },
};

contextBridge.exposeInMainWorld("biliDesk", api);
