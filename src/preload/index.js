import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc-channels";
const fullscreenChangeCallbacks = new Set();
let fullscreenIpcBound = false;
const navigateCallbacks = new Set();
let navigateIpcBound = false;
const integrityProgressCallbacks = new Set();
let integrityProgressIpcBound = false;
const upActivityProgressCallbacks = new Set();
let upActivityProgressIpcBound = false;
const footprintProgressCallbacks = new Set();
let footprintProgressIpcBound = false;
const upPortraitProgressCallbacks = new Set();
let upPortraitProgressIpcBound = false;
function subscribeFullscreenChange(callback) {
    if (!fullscreenIpcBound) {
        fullscreenIpcBound = true;
        ipcRenderer.on(IPC.APP_FULLSCREEN_CHANGED, (_event, on) => {
            const value = Boolean(on);
            for (const cb of fullscreenChangeCallbacks) {
                cb(value);
            }
        });
    }
    fullscreenChangeCallbacks.add(callback);
    return () => {
        fullscreenChangeCallbacks.delete(callback);
    };
}
const windowStateCallbacks = new Set();
let windowStateIpcBound = false;
function subscribeWindowState(callback) {
    if (!windowStateIpcBound) {
        windowStateIpcBound = true;
        ipcRenderer.on(IPC.APP_WINDOW_STATE_CHANGED, (_event, state) => {
            for (const cb of windowStateCallbacks)
                cb(state);
        });
    }
    windowStateCallbacks.add(callback);
    return () => {
        windowStateCallbacks.delete(callback);
    };
}
function subscribeNavigate(callback) {
    if (!navigateIpcBound) {
        navigateIpcBound = true;
        ipcRenderer.on(IPC.APP_NAVIGATE, (_event, path) => {
            const next = String(path ?? "").trim();
            if (!next.startsWith("/"))
                return;
            for (const cb of navigateCallbacks) {
                cb(next);
            }
        });
    }
    navigateCallbacks.add(callback);
    return () => {
        navigateCallbacks.delete(callback);
    };
}
function subscribeIntegrityProgress(callback) {
    if (!integrityProgressIpcBound) {
        integrityProgressIpcBound = true;
        ipcRenderer.on(IPC.BILI_INTEGRITY_PROGRESS, (_event, progress) => {
            for (const cb of integrityProgressCallbacks) {
                cb(progress);
            }
        });
    }
    integrityProgressCallbacks.add(callback);
    return () => {
        integrityProgressCallbacks.delete(callback);
    };
}
function subscribeUpActivityProgress(callback) {
    if (!upActivityProgressIpcBound) {
        upActivityProgressIpcBound = true;
        ipcRenderer.on(IPC.BILI_UP_ACTIVITY_PROGRESS, (_event, progress) => {
            for (const cb of upActivityProgressCallbacks) {
                cb(progress);
            }
        });
    }
    upActivityProgressCallbacks.add(callback);
    return () => {
        upActivityProgressCallbacks.delete(callback);
    };
}
function subscribeFootprintProgress(callback) {
    if (!footprintProgressIpcBound) {
        footprintProgressIpcBound = true;
        ipcRenderer.on(IPC.BILI_FOOTPRINT_PROGRESS, (_event, progress) => {
            for (const cb of footprintProgressCallbacks) {
                cb(progress);
            }
        });
    }
    footprintProgressCallbacks.add(callback);
    return () => {
        footprintProgressCallbacks.delete(callback);
    };
}
function subscribeUpPortraitProgress(callback) {
    if (!upPortraitProgressIpcBound) {
        upPortraitProgressIpcBound = true;
        ipcRenderer.on(IPC.TAXONOMY_UP_PORTRAIT_PROGRESS, (_event, progress) => {
            for (const cb of upPortraitProgressCallbacks) {
                cb(progress);
            }
        });
    }
    upPortraitProgressCallbacks.add(callback);
    return () => {
        upPortraitProgressCallbacks.delete(callback);
    };
}
const api = {
    auth: {
        getQrCode: () => ipcRenderer.invoke(IPC.AUTH_GET_QR),
        pollLogin: (qrcodeKey) => ipcRenderer.invoke(IPC.AUTH_POLL, qrcodeKey),
        logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
        getStatus: () => ipcRenderer.invoke(IPC.AUTH_STATUS),
    },
    bili: {
        getRecommend: (options) => options
            ? ipcRenderer.invoke(IPC.BILI_RECOMMEND, options)
            : ipcRenderer.invoke(IPC.BILI_RECOMMEND),
        getPopularVideos: (page) => ipcRenderer.invoke(IPC.BILI_POPULAR, page ?? 1),
        getAllPopularVideos: () => ipcRenderer.invoke(IPC.BILI_POPULAR_ALL),
        getWeeklySeriesList: () => ipcRenderer.invoke(IPC.BILI_WEEKLY_SERIES_LIST),
        getWeeklySeries: (number) => ipcRenderer.invoke(IPC.BILI_WEEKLY_SERIES, number),
        getPreciousVideos: () => ipcRenderer.invoke(IPC.BILI_PRECIOUS),
        getRankingVideos: (rid) => ipcRenderer.invoke(IPC.BILI_RANKING, rid ?? 0),
        getMusicRankPeriods: () => ipcRenderer.invoke(IPC.BILI_MUSIC_RANK_PERIODS),
        getMusicRankList: (listId) => ipcRenderer.invoke(IPC.BILI_MUSIC_RANK_LIST, listId),
        getLiveRecommend: (page) => page == null
            ? ipcRenderer.invoke(IPC.BILI_LIVE_RECOMMEND)
            : ipcRenderer.invoke(IPC.BILI_LIVE_RECOMMEND, page),
        getFollowingLives: () => ipcRenderer.invoke(IPC.BILI_LIVE_FOLLOWING),
        getLiveRoom: (roomId) => ipcRenderer.invoke(IPC.BILI_LIVE_ROOM, roomId),
        getLivePlayUrl: (roomId, qn) => qn == null
            ? ipcRenderer.invoke(IPC.BILI_LIVE_PLAY_URL, roomId)
            : ipcRenderer.invoke(IPC.BILI_LIVE_PLAY_URL, roomId, qn),
        getLiveDanmuInfo: (roomId) => ipcRenderer.invoke(IPC.BILI_LIVE_DANMU_INFO, roomId),
        getLiveDanmuHistory: (roomId) => ipcRenderer.invoke(IPC.BILI_LIVE_DANMU_HISTORY, roomId),
        getLiveEmotes: (roomId) => ipcRenderer.invoke(IPC.BILI_LIVE_EMOTES, roomId),
        sendLiveDanmu: (roomId, message) => ipcRenderer.invoke(IPC.BILI_LIVE_DANMU_SEND, roomId, message),
        getLiveRoomViewers: (roomId, uid) => ipcRenderer.invoke(IPC.BILI_LIVE_ROOM_VIEWERS, roomId, uid),
        getVideo: (bvid) => ipcRenderer.invoke(IPC.BILI_VIDEO, bvid),
        getRelatedVideos: (bvid) => ipcRenderer.invoke(IPC.BILI_RELATED_VIDEOS, bvid),
        getVideoOnlineTotal: (aid, cid, bvid) => ipcRenderer.invoke(IPC.BILI_VIDEO_ONLINE, aid, cid, bvid),
        getVideoSubtitles: (bvid, cid) => ipcRenderer.invoke(IPC.BILI_VIDEO_SUBTITLES, bvid, cid),
        getPlayUrl: (bvid, cid, qn, options) => ipcRenderer.invoke(IPC.BILI_PLAY_URL, bvid, cid, qn, options),
        fetchMediaRange: (url, range, referer) => ipcRenderer.invoke(IPC.BILI_MEDIA_RANGE, url, range, referer),
        getVideoRelation: (bvid, aid) => ipcRenderer.invoke(IPC.BILI_VIDEO_RELATION, bvid, aid),
        tripleVideo: (aid, bvid) => ipcRenderer.invoke(IPC.BILI_VIDEO_TRIPLE, aid, bvid),
        getVideoAiSummary: (bvid, cid, upMid) => ipcRenderer.invoke(IPC.BILI_VIDEO_AI_SUMMARY, bvid, cid, upMid),
        dislikeRecommend: (payload) => ipcRenderer.invoke(IPC.BILI_RECOMMEND_DISLIKE, payload),
        getMentionSuggest: (keyword) => ipcRenderer.invoke(IPC.BILI_MENTION_SUGGEST, keyword),
        getDanmakuHistoryDates: (cid, month) => ipcRenderer.invoke(IPC.BILI_DM_HISTORY_DATES, cid, month),
        getDanmakuHistory: (cid, date) => ipcRenderer.invoke(IPC.BILI_DM_HISTORY, cid, date),
        syncDanmakuConfig: (config) => ipcRenderer.invoke(IPC.BILI_DM_CLOUD_CONFIG, config),
        getVideoSnapshot: (bvid, cid) => ipcRenderer.invoke(IPC.BILI_VIDEO_SNAPSHOT, bvid, cid),
        getVipCenter: () => ipcRenderer.invoke(IPC.BILI_VIP_CENTER),
        claimVipExperience: () => ipcRenderer.invoke(IPC.BILI_VIP_EXPERIENCE),
        getVipPrivileges: () => ipcRenderer.invoke(IPC.BILI_VIP_PRIVILEGES),
        receiveVipPrivilege: (type) => ipcRenderer.invoke(IPC.BILI_VIP_PRIVILEGE_RECEIVE, type),
        getExpReward: () => ipcRenderer.invoke(IPC.BILI_EXP_REWARD),
        getCoinLog: () => ipcRenderer.invoke(IPC.BILI_COIN_LOG),
        getExpLog: () => ipcRenderer.invoke(IPC.BILI_EXP_LOG),
        getFansMedals: (page) => ipcRenderer.invoke(IPC.BILI_FANS_MEDALS, page ?? 1),
        wearFansMedal: (medalId) => ipcRenderer.invoke(IPC.BILI_FANS_MEDAL_WEAR, medalId),
        likeVideo: (aid, like) => ipcRenderer.invoke(IPC.BILI_VIDEO_LIKE, aid, like),
        dislikeVideo: (aid, dislike) => ipcRenderer.invoke(IPC.BILI_VIDEO_DISLIKE, aid, dislike),
        addCoin: (payload) => ipcRenderer.invoke(IPC.BILI_VIDEO_COIN, payload),
        shareVideo: (aid, bvid) => ipcRenderer.invoke(IPC.BILI_VIDEO_SHARE, aid, bvid),
        reportWatchHeartbeat: (payload) => ipcRenderer.invoke(IPC.BILI_WATCH_HEARTBEAT, payload),
        getDanmakuList: (cid) => ipcRenderer.invoke(IPC.BILI_DANMAKU_LIST, cid),
        sendDanmaku: (payload) => ipcRenderer.invoke(IPC.BILI_DANMAKU_SEND, payload),
        getCommandDanmakuList: (aid, cid) => ipcRenderer.invoke(IPC.BILI_COMMAND_DANMAKU_LIST, aid, cid),
        postCommandGrade: (payload) => ipcRenderer.invoke(IPC.BILI_COMMAND_GRADE_POST, payload),
        postCommandVote: (payload) => ipcRenderer.invoke(IPC.BILI_COMMAND_VOTE_POST, payload),
        getDanmakuFilters: () => ipcRenderer.invoke(IPC.BILI_DM_FILTERS),
        addDanmakuFilter: (text, kind) => ipcRenderer.invoke(IPC.BILI_DM_FILTER_ADD, text, kind ?? "text"),
        recallDanmaku: (cid, dmid) => ipcRenderer.invoke(IPC.BILI_DM_RECALL, cid, dmid),
        removeDanmakuFilter: (id) => ipcRenderer.invoke(IPC.BILI_DM_FILTER_DEL, id),
        likeDanmaku: (cid, dmid, like) => ipcRenderer.invoke(IPC.BILI_DM_LIKE, cid, dmid, like),
        reportDanmaku: (cid, dmid, reason) => ipcRenderer.invoke(IPC.BILI_DM_REPORT, cid, dmid, reason ?? 11),
        getVideoChapters: (bvid, cid) => ipcRenderer.invoke(IPC.BILI_VIDEO_CHAPTERS, bvid, cid),
        getVideoHeatmap: (bvid, cid) => ipcRenderer.invoke(IPC.BILI_VIDEO_HEATMAP, bvid, cid),
        getArchiveNotes: (aid) => ipcRenderer.invoke(IPC.BILI_VIDEO_NOTES, aid),
        addArchiveNote: (aid, title, text) => ipcRenderer.invoke(IPC.BILI_VIDEO_NOTE_ADD, aid, title, text),
        downloadVideo: (bvid, cid, qn) => ipcRenderer.invoke(IPC.BILI_VIDEO_DOWNLOAD, bvid, cid, qn),
        getSeason: (kind, id, by) => ipcRenderer.invoke(IPC.BILI_SEASON, kind, id, by ?? "season"),
        getSeasonPlayUrl: (kind, epId, cid, qn) => ipcRenderer.invoke(IPC.BILI_SEASON_PLAY, kind, epId, cid, qn),
        setSeasonFollow: (kind, seasonId, follow) => ipcRenderer.invoke(IPC.BILI_SEASON_FOLLOW, kind, seasonId, follow),
        getChannelVideos: (channelId, page) => ipcRenderer.invoke(IPC.BILI_CHANNEL_VIDEOS, channelId, page ?? 1),
        getAudioSong: (sid) => ipcRenderer.invoke(IPC.BILI_AUDIO_SONG, sid),
        updateMyProfile: (input) => ipcRenderer.invoke(IPC.BILI_PROFILE_UPDATE, input),
        updateMyFace: (file) => ipcRenderer.invoke(IPC.BILI_PROFILE_FACE, file),
        getWallet: () => ipcRenderer.invoke(IPC.BILI_WALLET),
        classifyTitles: (items) => ipcRenderer.invoke(IPC.BILI_CLASSIFY_TITLES, items),
        getComments: (aid, page, sort, offset, seekRpid) => ipcRenderer.invoke(IPC.BILI_COMMENT_LIST, aid, page ?? 1, sort ?? 0, offset ?? "", seekRpid ?? 0),
        getCommentReplies: (aid, root, page) => ipcRenderer.invoke(IPC.BILI_COMMENT_REPLIES, aid, root, page ?? 1),
        addComment: (aid, message, root, parent, images) => ipcRenderer.invoke(IPC.BILI_COMMENT_ADD, aid, message, root ?? 0, parent ?? 0, images ?? []),
        likeComment: (aid, rpid, like) => ipcRenderer.invoke(IPC.BILI_COMMENT_LIKE, aid, rpid, like),
        hateComment: (oid, type, rpid, hate) => ipcRenderer.invoke(IPC.BILI_COMMENT_HATE, oid, type, rpid, hate),
        pinComment: (oid, type, rpid, pin) => ipcRenderer.invoke(IPC.BILI_COMMENT_PIN, oid, type, rpid, pin),
        deleteComment: (oid, type, rpid) => ipcRenderer.invoke(IPC.BILI_COMMENT_DELETE, oid, type, rpid),
        reportComment: (oid, type, rpid, reason) => ipcRenderer.invoke(IPC.BILI_COMMENT_REPORT, oid, type, rpid, reason),
        translateComment: (oid, type, rpid) => ipcRenderer.invoke(IPC.BILI_COMMENT_TRANSLATE, oid, type, rpid),
        getReplyEmotes: () => ipcRenderer.invoke(IPC.BILI_REPLY_EMOTES),
        getFavFolders: () => ipcRenderer.invoke(IPC.BILI_FAV_FOLDERS),
        createFavFolder: (payload) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_CREATE, payload),
        getFavFolderInfo: (mediaId) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_INFO, mediaId),
        editFavFolder: (payload) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_EDIT, payload),
        deleteFavFolder: (mediaId) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_DELETE, mediaId),
        sortFavFolders: (mediaIds) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_SORT, mediaIds),
        getVideoFavFolders: (aid) => ipcRenderer.invoke(IPC.BILI_VIDEO_FAV_FOLDERS, aid),
        suggestFavFolder: (payload) => ipcRenderer.invoke(IPC.BILI_FAV_FOLDER_SUGGEST, payload),
        setVideoFavFolders: (aid, addMediaIds, delMediaIds) => ipcRenderer.invoke(IPC.BILI_VIDEO_FAV_SET, aid, addMediaIds, delMediaIds),
        getFavResources: (mediaId, page, riskRetry, expectedCount) => ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES, mediaId, page, riskRetry, expectedCount),
        removeFavResources: (mediaId, aids) => ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES_REMOVE, mediaId, aids),
        moveFavResources: (srcMediaId, tarMediaId, aids) => ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES_MOVE, srcMediaId, tarMediaId, aids),
        cleanFavResources: (mediaId) => ipcRenderer.invoke(IPC.BILI_FAV_RESOURCES_CLEAN, mediaId),
        getFollowings: (page, order) => ipcRenderer.invoke(IPC.BILI_FOLLOWINGS, page ?? 1, order ?? "recent"),
        getFollowTags: () => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAGS),
        createFollowTag: (name) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_CREATE, name),
        renameFollowTag: (tagId, name) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_RENAME, tagId, name),
        deleteFollowTag: (tagId) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_DELETE, tagId),
        previewFollowTagSync: (followedMids) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_SYNC_PREVIEW, followedMids),
        startFollowTagSync: (planId) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_SYNC_START, planId),
        getFollowTagSyncStatus: () => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_SYNC_STATUS),
        cancelFollowTagSync: () => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_SYNC_CANCEL),
        getFollowingsInTag: (tagId, page, order) => ipcRenderer.invoke(IPC.BILI_FOLLOW_TAG_MEMBERS, tagId, page ?? 1, order ?? "recent"),
        getUserRelationList: (mid, type, page) => ipcRenderer.invoke(IPC.BILI_USER_RELATION_LIST, mid, type, page ?? 1),
        getUserFollowTags: (mid) => ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS, mid),
        setUserFollowTags: (mid, tagIds) => ipcRenderer.invoke(IPC.BILI_FOLLOW_USER_TAGS_SET, mid, tagIds),
        getUpProfile: (mid) => ipcRenderer.invoke(IPC.BILI_UP_PROFILE, mid),
        getUpRelation: (mid) => ipcRenderer.invoke(IPC.BILI_UP_RELATION, mid),
        modifyFollow: (mid, follow) => ipcRenderer.invoke(IPC.BILI_UP_MODIFY_FOLLOW, mid, follow),
        modifySpecialFollow: (mid, special) => ipcRenderer.invoke(IPC.BILI_UP_MODIFY_SPECIAL, mid, special),
        getBlacklist: (page) => ipcRenderer.invoke(IPC.BILI_BLACKLIST, page ?? 1),
        modifyBlock: (mid, block) => ipcRenderer.invoke(IPC.BILI_UP_MODIFY_BLOCK, mid, block),
        getUpVideos: (mid, page, order, keyword, specialType) => ipcRenderer.invoke(IPC.BILI_UP_VIDEOS, mid, page ?? 1, order ?? "pubdate", keyword ?? "", specialType ?? ""),
        getUpCourses: (mid, page) => ipcRenderer.invoke(IPC.BILI_UP_COURSES, mid, page ?? 1),
        searchVideos: (keyword, page, order, apiStartPage, pageSize) => ipcRenderer.invoke(IPC.BILI_SEARCH, keyword, page ?? 1, order, apiStartPage ?? 1, pageSize ?? 30),
        lookupChargeBadges: (bvids) => ipcRenderer.invoke(IPC.BILI_CHARGE_BADGES, bvids),
        searchUsers: (keyword, page, order, userType) => ipcRenderer.invoke(IPC.BILI_SEARCH_USERS, keyword, page ?? 1, order, userType ?? 0),
        searchArticles: (keyword, page, order) => ipcRenderer.invoke(IPC.BILI_SEARCH_ARTICLES, keyword, page ?? 1, order ?? "totalrank"),
        searchMedia: (keyword, kind, page) => ipcRenderer.invoke(IPC.BILI_SEARCH_MEDIA, keyword, kind, page ?? 1),
        searchLiveRooms: (keyword, page, order) => ipcRenderer.invoke(IPC.BILI_SEARCH_LIVE, keyword, page ?? 1, order ?? "online"),
        getSearchSuggest: (term) => ipcRenderer.invoke(IPC.BILI_SEARCH_SUGGEST, term),
        getSearchTypeCounts: (keyword) => ipcRenderer.invoke(IPC.BILI_SEARCH_TYPE_COUNTS, keyword),
        getToViewList: () => ipcRenderer.invoke(IPC.BILI_TOVIEW_LIST),
        addToView: (aid, bvid, video, forceLocal) => ipcRenderer.invoke(IPC.BILI_TOVIEW_ADD, aid, bvid, video, forceLocal),
        removeFromToView: (aid) => ipcRenderer.invoke(IPC.BILI_TOVIEW_REMOVE, aid),
        clearToView: () => ipcRenderer.invoke(IPC.BILI_TOVIEW_CLEAR),
        getLocalToViewList: () => ipcRenderer.invoke(IPC.BILI_TOVIEW_LOCAL_LIST),
        removeFromLocalToView: (bvid) => ipcRenderer.invoke(IPC.BILI_TOVIEW_LOCAL_REMOVE, bvid),
        removeManyFromLocalToView: (bvids) => ipcRenderer.invoke(IPC.BILI_TOVIEW_LOCAL_REMOVE, bvids),
        scanIntegrity: (scope) => ipcRenderer.invoke(IPC.BILI_INTEGRITY_SCAN, scope ?? "favorites"),
        getIntegrityArchive: () => ipcRenderer.invoke(IPC.BILI_INTEGRITY_ARCHIVE),
        dismissInvalidVideo: (id) => ipcRenderer.invoke(IPC.BILI_INTEGRITY_DISMISS_VIDEO, id),
        dismissAbnormalFollowing: (mid) => ipcRenderer.invoke(IPC.BILI_INTEGRITY_DISMISS_FOLLOWING, mid),
        clearIntegrityArchive: (scope) => ipcRenderer.invoke(IPC.BILI_INTEGRITY_CLEAR, scope),
        onIntegrityProgress: (callback) => subscribeIntegrityProgress(callback),
        scanUpActivity: () => ipcRenderer.invoke(IPC.BILI_UP_ACTIVITY_SCAN),
        getUpActivityArchive: () => ipcRenderer.invoke(IPC.BILI_UP_ACTIVITY_ARCHIVE),
        clearUpActivityArchive: () => ipcRenderer.invoke(IPC.BILI_UP_ACTIVITY_CLEAR),
        removeUpActivityRecords: (mids) => ipcRenderer.invoke(IPC.BILI_UP_ACTIVITY_REMOVE, mids),
        onUpActivityProgress: (callback) => subscribeUpActivityProgress(callback),
        getSpaceDynamics: (mid, offset) => ipcRenderer.invoke(IPC.BILI_SPACE_DYNAMICS, mid, offset ?? ""),
        getSpaceOpus: (mid, offset) => ipcRenderer.invoke(IPC.BILI_SPACE_OPUS, mid, offset ?? ""),
        getFollowDynamics: (offset, type) => ipcRenderer.invoke(IPC.BILI_FOLLOW_DYNAMICS, offset ?? "", type ?? "all"),
        getDynamicDetail: (id) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_DETAIL, id),
        doDynamicVote: (voteId, optionIdxs) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_VOTE, voteId, optionIdxs),
        likeDynamic: (id, like) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_LIKE, id, like),
        favoriteDynamic: (id, favorite) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_FAV, id, favorite),
        setDynamicTop: (id, top) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_TOP, id, top),
        removeDynamic: (id) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_REMOVE, id),
        reportDynamic: (id, accusedUid, reasonType) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_REPORT, id, accusedUid, reasonType),
        equipDynamicCard: (itemId) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_EQUIP_CARD, itemId),
        createDynamic: (text, images, options) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_CREATE, text, images ?? [], options),
        editDynamic: (id, text, images, options) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_EDIT, id, text, images ?? [], options),
        setDynamicPrivate: (id, privatePub) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_PRIVATE, id, privatePub),
        searchTopics: (keyword) => ipcRenderer.invoke(IPC.BILI_TOPIC_SEARCH, keyword),
        getTopicHead: (topicId) => ipcRenderer.invoke(IPC.BILI_TOPIC_HEAD, topicId),
        favoriteTopic: (topicId, favorite) => ipcRenderer.invoke(IPC.BILI_TOPIC_FAV, topicId, favorite),
        repostDynamic: (id, text) => ipcRenderer.invoke(IPC.BILI_DYNAMIC_REPOST, id, text ?? ""),
        getHotSearch: () => ipcRenderer.invoke(IPC.BILI_HOT_SEARCH),
        getTopicDynamics: (topicId, offset) => ipcRenderer.invoke(IPC.BILI_TOPIC_FEED, topicId, offset ?? ""),
        getArticle: (id) => ipcRenderer.invoke(IPC.BILI_ARTICLE_VIEW, id),
        likeArticle: (id, like) => ipcRenderer.invoke(IPC.BILI_ARTICLE_LIKE, id, like),
        coinArticle: (id, upMid, multiply) => ipcRenderer.invoke(IPC.BILI_ARTICLE_COIN, id, upMid, multiply ?? 1),
        favoriteArticle: (id, favorite) => ipcRenderer.invoke(IPC.BILI_ARTICLE_FAV, id, favorite),
        getTargetComments: (oid, type, page, sort, offset, seekRpid) => ipcRenderer.invoke(IPC.BILI_TARGET_COMMENT_LIST, oid, type, page ?? 1, sort ?? 0, offset ?? "", seekRpid ?? 0),
        getTargetCommentReplies: (oid, type, root, page) => ipcRenderer.invoke(IPC.BILI_TARGET_COMMENT_REPLIES, oid, type, root, page ?? 1),
        addTargetComment: (oid, type, message, root, parent, images) => ipcRenderer.invoke(IPC.BILI_TARGET_COMMENT_ADD, oid, type, message, root ?? 0, parent ?? 0, images ?? []),
        likeTargetComment: (oid, type, rpid, like) => ipcRenderer.invoke(IPC.BILI_TARGET_COMMENT_LIKE, oid, type, rpid, like),
        getWatchHistory: (type, cursor, filters) => ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY, type ?? "all", cursor, filters),
        deleteWatchHistory: (item) => ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY_DELETE, item),
        clearWatchHistory: () => ipcRenderer.invoke(IPC.BILI_WATCH_HISTORY_CLEAR),
        getHistoryShadow: () => ipcRenderer.invoke(IPC.BILI_HISTORY_SHADOW_GET),
        setHistoryShadow: (record) => ipcRenderer.invoke(IPC.BILI_HISTORY_SHADOW_SET, record),
        getUserCollections: (mid, page) => ipcRenderer.invoke(IPC.BILI_USER_COLLECTIONS, mid, page ?? 1),
        getSeasonArchives: (mid, seasonId, page) => ipcRenderer.invoke(IPC.BILI_SEASON_ARCHIVES, mid, seasonId, page ?? 1),
        getSeriesArchives: (seriesId, page) => ipcRenderer.invoke(IPC.BILI_SERIES_ARCHIVES, seriesId, page ?? 1),
        getBangumiFollowList: (mid, type, page) => ipcRenderer.invoke(IPC.BILI_BANGUMI_FOLLOW, mid, type ?? 1, page ?? 1),
        getSubscribedCollections: (page) => ipcRenderer.invoke(IPC.BILI_SUBSCRIBED_COLLECTIONS, page ?? 1),
        getLocalCollections: () => ipcRenderer.invoke(IPC.BILI_COLLECTIONS_LOCAL),
        getCollectionGroups: () => ipcRenderer.invoke(IPC.BILI_COLLECTION_GROUPS),
        classifyCollections: (mode) => ipcRenderer.invoke(IPC.BILI_COLLECTION_CLASSIFY, mode),
        setCollectionGroup: (key, group) => ipcRenderer.invoke(IPC.BILI_COLLECTION_GROUP_SET, key, group),
        renameCollectionGroup: (l1, l2, name) => ipcRenderer.invoke(IPC.BILI_COLLECTION_GROUP_RENAME, l1, l2, name),
        onCollectionClassifyProgress: (callback) => {
            const listener = (_event, progress) => callback(progress);
            ipcRenderer.on(IPC.BILI_COLLECTION_CLASSIFY_PROGRESS, listener);
            return () => {
                ipcRenderer.removeListener(IPC.BILI_COLLECTION_CLASSIFY_PROGRESS, listener);
            };
        },
        getUgcSeasonSubscribed: (seasonId) => ipcRenderer.invoke(IPC.BILI_UGC_SEASON_SUBSCRIBED, seasonId),
        setUgcSeasonSubscribe: (seasonId, subscribe) => ipcRenderer.invoke(IPC.BILI_UGC_SEASON_SUBSCRIBE_SET, seasonId, subscribe),
        getFavVideoMedias: (page) => ipcRenderer.invoke(IPC.BILI_FAV_VIDEO_MEDIAS, page ?? 1),
        getOpusFavorites: (page) => ipcRenderer.invoke(IPC.BILI_OPUS_FAVORITES, page ?? 1),
        getCheeseFollowList: (page, mid) => ipcRenderer.invoke(IPC.BILI_CHEESE_FOLLOW, page ?? 1, mid),
        getUpowerPaidList: () => ipcRenderer.invoke(IPC.BILI_UPOWER_PAID),
        getMessageUnread: () => ipcRenderer.invoke(IPC.BILI_MSG_UNREAD),
        getNewFans: (page) => ipcRenderer.invoke(IPC.BILI_MSG_NEW_FANS, page ?? 1),
        getMessageSessions: (filter, endTs) => ipcRenderer.invoke(IPC.BILI_MSG_SESSIONS, filter ?? "all", endTs ?? 0),
        getChatMessages: (talkerId, sessionType, endSeqno) => ipcRenderer.invoke(IPC.BILI_MSG_CHAT, talkerId, sessionType, endSeqno ?? ""),
        sendChatMessage: (talkerId, sessionType, text) => ipcRenderer.invoke(IPC.BILI_MSG_SEND, talkerId, sessionType, text),
        sendChatImage: (talkerId, sessionType, file) => ipcRenderer.invoke(IPC.BILI_MSG_SEND_IMAGE, talkerId, sessionType, file),
        sendChatShare: (talkerId, sessionType, card) => ipcRenderer.invoke(IPC.BILI_MSG_SEND_SHARE, talkerId, sessionType, card),
        markChatRead: (talkerId, sessionType, ackSeqno) => ipcRenderer.invoke(IPC.BILI_MSG_READ, talkerId, sessionType, ackSeqno ?? ""),
        setChatPinned: (talkerId, sessionType, pinned) => ipcRenderer.invoke(IPC.BILI_MSG_SESSION_TOP, talkerId, sessionType, pinned),
        setChatMuted: (talkerId, sessionType, muted) => ipcRenderer.invoke(IPC.BILI_MSG_SESSION_DND, talkerId, sessionType, muted),
        removeChatSession: (talkerId, sessionType) => ipcRenderer.invoke(IPC.BILI_MSG_SESSION_REMOVE, talkerId, sessionType),
        recallChatMessage: (talkerId, sessionType, msgKey) => ipcRenderer.invoke(IPC.BILI_MSG_RECALL, talkerId, sessionType, msgKey),
        getMessageFeed: (kind, cursorId, cursorTime) => ipcRenderer.invoke(IPC.BILI_MSG_FEED, kind, cursorId ?? 0, cursorTime ?? 0),
        deleteMessageFeed: (kind, id) => ipcRenderer.invoke(IPC.BILI_MSG_FEED_DELETE, kind, id),
        getMyReplies: (cursorId, cursorTime, keyword) => ipcRenderer.invoke(IPC.BILI_MSG_MY_REPLIES, cursorId ?? 0, cursorTime ?? 0, keyword ?? ""),
        getSystemNotices: (cursor) => ipcRenderer.invoke(IPC.BILI_MSG_NOTICES, cursor ?? ""),
        getMessageSettings: () => ipcRenderer.invoke(IPC.BILI_MSG_SETTINGS_GET),
        setMessageSettings: (patch) => ipcRenderer.invoke(IPC.BILI_MSG_SETTINGS_SET, patch),
        addMessageBlockWord: (word) => ipcRenderer.invoke(IPC.BILI_MSG_BLOCK_ADD, word),
        removeMessageBlockWord: (word) => ipcRenderer.invoke(IPC.BILI_MSG_BLOCK_DEL, word),
        listFootprint: (query) => ipcRenderer.invoke(IPC.BILI_FOOTPRINT_LIST, query),
        syncFootprint: (kinds, options) => ipcRenderer.invoke(IPC.BILI_FOOTPRINT_SYNC, kinds ?? "all", options),
        abortFootprintSync: () => ipcRenderer.invoke(IPC.BILI_FOOTPRINT_SYNC_ABORT),
        getFootprintSyncStatus: () => ipcRenderer.invoke(IPC.BILI_FOOTPRINT_SYNC_STATUS),
        onFootprintProgress: (callback) => subscribeFootprintProgress(callback),
    },
    taxonomy: {
        getTree: () => ipcRenderer.invoke(IPC.TAXONOMY_TREE),
        createL1: (name, icon) => icon
            ? ipcRenderer.invoke(IPC.TAXONOMY_L1_CREATE, name, icon)
            : ipcRenderer.invoke(IPC.TAXONOMY_L1_CREATE, name),
        createL2: (categoryL1Id, name) => ipcRenderer.invoke(IPC.TAXONOMY_L2_CREATE, categoryL1Id, name),
        createL3: (categoryL2Id, name) => ipcRenderer.invoke(IPC.TAXONOMY_L3_CREATE, categoryL2Id, name),
        updateCategoryName: (level, id, name) => ipcRenderer.invoke(IPC.TAXONOMY_CATEGORY_UPDATE, level, id, name),
        getFavoriteAssignments: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_ASSIGNMENTS),
        classifyAllFavorites: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_ALL),
        getFavClassifyResume: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_RESUME),
        classifyFolderFavorites: (mediaId) => ipcRenderer.invoke(IPC.TAXONOMY_FAV_CLASSIFY_FOLDER, mediaId),
        organizeBiliFavorites: (overrides) => ipcRenderer.invoke(IPC.TAXONOMY_FAV_ORGANIZE_BILI, overrides),
        mergeDumpFavIntoDefault: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_MERGE_DUMP),
        mergeDuplicateTopicFolders: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_MERGE_DUP_TOPICS),
        getFavTaskStatus: (taskId) => ipcRenderer.invoke(IPC.TAXONOMY_FAV_TASK_STATUS, taskId),
        enrichFavoriteCovers: () => ipcRenderer.invoke(IPC.TAXONOMY_FAV_ENRICH_COVERS),
        getUpGroups: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUPS),
        getUpGroupTree: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_TREE),
        createUpGroup: (name, color) => color
            ? ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_CREATE, name, color)
            : ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_CREATE, name),
        getUpGroupMemberMids: (selection) => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_MEMBERS, selection),
        getUpAssignmentPaths: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_ASSIGNMENT_PATHS),
        getUpPortraitGraph: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_PORTRAIT_GRAPH),
        rebuildUpPortraits: () => ipcRenderer.invoke(IPC.TAXONOMY_UP_PORTRAIT_REBUILD),
        onUpPortraitProgress: (callback) => subscribeUpPortraitProgress(callback),
        renameUpGroup: (id, name) => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_RENAME, id, name),
        reorderUpGroups: (ids) => ipcRenderer.invoke(IPC.TAXONOMY_UP_GROUP_REORDER, ids),
    },
    ai: {
        getConfig: () => ipcRenderer.invoke(IPC.AI_CONFIG_GET),
        setConfig: (config) => ipcRenderer.invoke(IPC.AI_CONFIG_SET, config),
        testConnection: () => ipcRenderer.invoke(IPC.AI_TEST),
        runUpClassification: (mode) => ipcRenderer.invoke(IPC.AI_RUN_UP_CLASSIFY, mode ?? "shallow"),
        getUpClassifyInfo: () => ipcRenderer.invoke(IPC.AI_UP_CLASSIFY_INFO),
        getTaskStatus: (taskId) => ipcRenderer.invoke(IPC.AI_TASK_STATUS, taskId),
    },
    app: {
        getTheme: () => ipcRenderer.invoke(IPC.APP_GET_THEME),
        setTheme: (theme) => ipcRenderer.invoke(IPC.APP_SET_THEME, theme),
        setThemePreset: (preset) => ipcRenderer.invoke(IPC.APP_SET_THEME_PRESET, preset),
        setWindowGlass: (enabled) => ipcRenderer.invoke(IPC.APP_SET_WINDOW_GLASS, enabled),
        setFullscreen: (on) => ipcRenderer.invoke(IPC.APP_SET_FULLSCREEN, on),
        isFullscreen: () => ipcRenderer.invoke(IPC.APP_GET_FULLSCREEN),
        onFullscreenChange: (callback) => subscribeFullscreenChange(callback),
        customTitleBar: process.platform === "win32",
        minimizeWindow: () => ipcRenderer.invoke(IPC.APP_WINDOW_MINIMIZE),
        toggleMaximizeWindow: () => ipcRenderer.invoke(IPC.APP_WINDOW_TOGGLE_MAXIMIZE),
        closeWindow: () => ipcRenderer.invoke(IPC.APP_WINDOW_CLOSE),
        getWindowState: () => ipcRenderer.invoke(IPC.APP_WINDOW_GET_STATE),
        onWindowStateChange: (callback) => subscribeWindowState(callback),
        onNavigate: (callback) => subscribeNavigate(callback),
        openExternal: (url) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
        resolveBiliUrl: (url) => ipcRenderer.invoke(IPC.APP_RESOLVE_BILI_URL, url),
        probeShortcut: (accelerator) => ipcRenderer.invoke(IPC.APP_PROBE_SHORTCUT, accelerator),
    },
};
contextBridge.exposeInMainWorld("biliDesk", api);
