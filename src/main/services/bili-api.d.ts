import type { AuthPollResult, FavFolder, FavResource, VideoFavFolder, FollowTag, FollowingUp, FollowingsPage, FollowingOrder, BlacklistPage, UserRelationListPage, QrLoginResult, UpProfile, UpRelation, UserInfo, VideoDetail, VideoItem, VideoSubtitleTrack, VideoOnlineTotal, PopularVideoItem, PopularFeedPage, WeeklySeriesMeta, WeeklySeriesDetail, PreciousVideosPage, MusicRankPeriod, MusicRankItem, VideoPlayInfo, DanmakuItem, SendDanmakuPayload, CommandDanmakuItem, PostCommandGradePayload, PostCommandVotePayload, VideoRelation, UgcTripleResult, VideoAiSummary, RecommendDislikePayload, MentionSuggestItem, DanmakuCloudConfig, VideoSnapshot, VipCenterInfo, VipPrivilegeItem, ExpRewardStatus, MemberLogItem, FansMedalPage, AddCoinPayload, WatchHeartbeatPayload, CommentItem, CommentPage, BinaryImageFile, HotSearchItem, DanmakuFilter, DanmakuFilterKind, DynamicPublishOptions, TopicHead, TopicSuggest, VideoChapter, SeasonDetail, ChannelVideoPage, AudioSong, ArchiveNote, WalletBalance, CreatedDynamic, ReplyEmotePanel, UpVideosPage, UpVideosOrder, SearchOrder, SearchVideosPage, SearchUsersPage, SearchUserOrder, SearchUserTypeFilter, SearchTypeCounts, SearchArticlesPage, SearchArticleOrder, SearchMediaKind, SearchMediaPage, SearchLiveOrder, SearchLivePage, SearchSuggestItem, ArticleDetail, ToViewItem, ToViewList, SpaceDynamicItem, DynamicVoteCard, SpaceDynamicPage, HistoryCursor, HistoryFeedType, HistoryFilters, FootprintItem, HistoryPage, UserCollectionsPage, BangumiFollowPage, FavMediasPage, OpusFavPage, SpaceOpusPage, CheeseCoursePage, ChargeRecordResult, LiveRecommendPage, FollowingLivePage, LiveRoomDetail, LivePlayInfo, LiveDanmuInfo, LiveChatMessage } from "@shared/types";
export declare const BILI_RISK_CONTROL_MESSAGE = "\u8BF7\u6C42\u88AB B \u7AD9\u5B89\u5168\u7B56\u7565\u62E6\u622A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
declare class BiliApiService {
    private client;
    private passportClient;
    private memberClient;
    private liveClient;
    private playQualityCache;
    private static readonly MAIN_CACHE_TTL_MS;
    private pruneBoundedMap;
    constructor();
    private buildTvSignedParams;
    private toFormBody;
    getQrCode(): Promise<QrLoginResult>;
    pollLogin(qrcodeKey: string): Promise<AuthPollResult>;
    private saveTvTokens;
    private loginRefreshTask;
    private lastLoginCheckAt;
    private static readonly LOGIN_CHECK_GAP_MS;
    private static readonly TOKEN_RENEW_BEFORE_MS;
    /**
     * 登录续期：Cookie 被服务端标记需要刷新、已失效，或令牌 7 天内到期时，
     * 用 TV 扫码拿到的 refresh_token 换新令牌和 Cookie。返回是否刷新过。
     */
    keepLoginFresh(): Promise<boolean>;
    private runLoginRefresh;
    private formatPassportError;
    private applyCookiesFromTvLogin;
    private finalizeLogin;
    private parseCookiesFromCrossDomainUrl;
    private applyCookiesToSession;
    private syncCookiesFromSession;
    private parseCookiesFromHeaders;
    fetchCurrentUser(): Promise<UserInfo | null>;
    private ensureBuvid3;
    getRecommend(options?: {
        freshIdx?: number;
        freshIdx1h?: number;
        ps?: number;
    }): Promise<{
        videos: VideoItem[];
        freshIdx: number;
        hasMore: boolean;
    }>;
    getPopularVideos(page?: number): Promise<PopularFeedPage>;
    /** 官方综合热门固定约 500 条，ps 最大 50，一次拉完前端再分区 / 分页 */
    getAllPopularVideos(): Promise<PopularVideoItem[]>;
    getWeeklySeriesList(): Promise<WeeklySeriesMeta[]>;
    getWeeklySeries(number: number): Promise<WeeklySeriesDetail>;
    getPreciousVideos(): Promise<PreciousVideosPage>;
    getRankingVideos(rid?: number): Promise<PopularVideoItem[]>;
    getMusicRankPeriods(): Promise<MusicRankPeriod[]>;
    getMusicRankList(listId: number): Promise<MusicRankItem[]>;
    private normalizeRecommendItems;
    private pickRcmdReason;
    private normalizePopularItems;
    getLiveRecommend(page?: number): Promise<LiveRecommendPage>;
    getFollowingLives(): Promise<FollowingLivePage>;
    /** 分页拉取关注直播（含未开播），用于 GetWebList 全量不足时兜底 */
    private fetchFollowingLivesByPages;
    getLiveRoom(roomId: number): Promise<LiveRoomDetail>;
    getLivePlayUrl(roomId: number, qn?: number): Promise<LivePlayInfo>;
    private getLegacyLivePlayUrl;
    private liveQualityLabel;
    private pickLiveStreamUrl;
    private normalizeHttps;
    private parseLiveViewers;
    getLiveRoomViewers(roomId: number, uid?: number): Promise<number>;
    private parseLiveWatched;
    private normalizeLiveDanmuInfo;
    getLiveDanmuInfo(roomId: number): Promise<LiveDanmuInfo>;
    getLiveDanmuHistory(roomId: number): Promise<LiveChatMessage[]>;
    getLiveEmotes(roomId: number): Promise<Record<string, string>>;
    sendLiveDanmu(roomId: number, message: string): Promise<void>;
    private normalizeLiveRoomItems;
    private asRecordArray;
    /** 取第一个有效正数（跳过 hit_ab=true 时 roomid=0 这类占位） */
    private pickPositiveId;
    private pickHttpUrl;
    private normalizeLiveRoomItem;
    getVideoBriefs(bvids: string[]): Promise<Array<{
        bvid: string;
        cover: string;
        upperName: string;
        duration: number;
    }>>;
    /** 稿件分区名（如 计算机技术 / 单机游戏），取不到返回空串 */
    getVideoTagNames(bvid: string): Promise<string[]>;
    getVideo(bvid: string): Promise<VideoDetail>;
    /** 充电视频文案和当前账号能不能看完整版。未开通时播放地址只有试看 */
    private readVideoCharge;
    private safeBiliHttpUrl;
    private parseVideoHonors;
    private parseVideoStaff;
    getRelatedVideos(bvid: string): Promise<VideoItem[]>;
    private normalizeRelatedVideo;
    getVideoOnlineTotal(aid: number, cid: number, bvid?: string): Promise<VideoOnlineTotal>;
    getVideoSubtitles(bvid: string, cid: number): Promise<VideoSubtitleTrack[]>;
    private biliSubtitleBodyToVtt;
    private formatVttTimestamp;
    /** 官网播放页右侧「合集」：view.ugc_season */
    private parseVideoUgcSeason;
    /** 官网简介下方标签：先新接口，失败再走旧 archive/tags */
    private getVideoTags;
    private fetchVideoTagList;
    private normalizeVideoTags;
    getVideoRelation(bvid: string, aid: number): Promise<VideoRelation>;
    /** 官网长按点赞：一次请求完成点赞 + 投 2 币 + 收藏到默认收藏夹 */
    tripleVideo(aid: number, bvid: string): Promise<UgcTripleResult>;
    /** 官网播放页「AI 视频总结」；没有总结时返回 null */
    getVideoAiSummary(bvid: string, cid: number, upMid: number): Promise<VideoAiSummary | null>;
    /** 首页推荐「不感兴趣」：走 APP 反馈接口，用 TV 扫码登录拿到的 access_key 签名 */
    dislikeRecommend(payload: RecommendDislikePayload): Promise<void>;
    private requireLogin;
    private assertOk;
    getVipCenter(): Promise<VipCenterInfo>;
    /** 大会员每日 +10 经验，已领过时 B 站返回错误文案 */
    claimVipExperience(): Promise<string>;
    private static readonly VIP_PRIVILEGE_NAMES;
    getVipPrivileges(): Promise<VipPrivilegeItem[]>;
    receiveVipPrivilege(type: number): Promise<void>;
    getExpReward(): Promise<ExpRewardStatus>;
    private getMemberLog;
    getCoinLog(): Promise<MemberLogItem[]>;
    getExpLog(): Promise<MemberLogItem[]>;
    getFansMedals(page?: number): Promise<FansMedalPage>;
    /** 传 null 表示摘下当前勋章 */
    wearFansMedal(medalId: number | null): Promise<void>;
    /** 发动态 @ 联想：官网同款，关注的人排前面 */
    getMentionSuggest(keyword: string): Promise<MentionSuggestItem[]>;
    /** 某月里有历史弹幕的日期（YYYY-MM-DD），需要登录 */
    getDanmakuHistoryDates(cid: number, month: string): Promise<string[]>;
    /** 指定日期的历史弹幕快照，需要登录 */
    getDanmakuHistory(cid: number, date: string): Promise<DanmakuItem[]>;
    /** 把播放器弹幕设置同步到账号（网页播放器配置），未登录静默跳过 */
    syncDanmakuConfig(config: DanmakuCloudConfig): Promise<void>;
    /** 进度条悬停预览图；图片转成 data URL，渲染层才能拼接到同一张画布 */
    getVideoSnapshot(bvid: string, cid: number): Promise<VideoSnapshot | null>;
    dislikeVideo(aid: number, dislike: boolean): Promise<void>;
    likeVideo(aid: number, like: boolean): Promise<void>;
    addCoin(payload: AddCoinPayload): Promise<void>;
    /** 给稿件加一次分享计数。复制链接本身不依赖此接口，失败只记日志不抛错。 */
    shareVideo(aid: number, bvid: string): Promise<boolean>;
    /**
     * 上报观看心跳 + 历史进度，同步到账号历史记录（官方客户端可见）
     */
    reportWatchHeartbeat(payload: WatchHeartbeatPayload): Promise<void>;
    private navPlayPrivilege;
    private fetchPlayPrivilege;
    private attachPlayMeta;
    getPlayUrl(bvid: string, cid: number, qn?: number, options?: {
        preferMp4?: boolean;
    }): Promise<VideoPlayInfo>;
    getVideoHeatmap(bvid: string, cid: number): Promise<number[]>;
    getArchiveNotes(aid: number): Promise<ArchiveNote[]>;
    addArchiveNote(aid: number, title: string, text: string): Promise<void>;
    downloadVideoFile(bvid: string, cid: number, dest: string, qn?: number): Promise<void>;
    getSeason(kind: "bangumi" | "cheese", id: number, by?: "season" | "ep"): Promise<SeasonDetail>;
    getSeasonPlayUrl(kind: "bangumi" | "cheese", epId: number, cid: number, qn?: number): Promise<VideoPlayInfo>;
    setSeasonFollow(kind: "bangumi" | "cheese", seasonId: number, follow: boolean): Promise<void>;
    getChannelVideos(channelId: number, page?: number): Promise<ChannelVideoPage>;
    getAudioSong(sid: number): Promise<AudioSong>;
    updateMyProfile(input: {
        name?: string;
        sign?: string;
    }): Promise<void>;
    updateMyFace(file: BinaryImageFile): Promise<string>;
    getWallet(): Promise<WalletBalance>;
    getDanmakuList(cid: number): Promise<DanmakuItem[]>;
    sendDanmaku(payload: SendDanmakuPayload): Promise<void>;
    /** 互动弹幕（评分 / 投票等），来自 dm/web/view protobuf */
    getCommandDanmakuList(aid: number, cid: number): Promise<CommandDanmakuItem[]>;
    postCommandGrade(payload: PostCommandGradePayload): Promise<{
        midScore: number;
    }>;
    postCommandVote(payload: PostCommandVotePayload): Promise<{
        myVote: number;
    }>;
    /**
     * 官方 Web 评论列表：/x/v2/reply/main（mode 3 热度 / 2 时间）
     * /x/v2/reply 会被 CDN 缓存，刚发的评论不在第一页；
     * /x/v2/reply/wbi/main 在 Electron 里会 -403，不能用。
     */
    private fetchReplyMainPage;
    getComments(aid: number, page?: number, sort?: 0 | 1 | 2, offset?: string, seekRpid?: number): Promise<CommentPage>;
    /** 拉少量热评原文，给收藏整理/推荐夹用 */
    getHotCommentTexts(aid: number, limit?: number): Promise<string[]>;
    getCommentReplies(aid: number, root: number, page?: number): Promise<CommentPage>;
    addComment(aid: number, message: string, root?: number, parent?: number, images?: BinaryImageFile[]): Promise<CommentItem | null>;
    likeComment(aid: number, rpid: number, like: boolean): Promise<void>;
    private postReplyForm;
    hateComment(oid: string, type: number, rpid: number | string, hate: boolean): Promise<void>;
    pinComment(oid: string, type: number, rpid: number, pin: boolean): Promise<void>;
    /**
     * B 站没有「我发出的全部评论」接口。
     * 从观看记录往回翻到已有索引的时间，把这段缺口里的评论和楼中楼补上。
     */
    listOwnCommentsFromRecentHistory(uid: number, onProgress?: (done: number, total: number, batch: FootprintItem[]) => void, shouldStop?: () => boolean, sinceTs?: number): Promise<{
        items: FootprintItem[];
        note: string;
    }>;
    private fetchTimeSortedReplies;
    private fetchReplyChildren;
    private pushOwnReply;
    /**
     * 这条评论在 B 站还在不在。
     * /x/v2/reply/reply 用 root=rpid：还在则 code=0；已删除是 12006「没有该评论」。
     * 楼中楼的 rpid 不是根评论，12006 时再用 seek_rpid 确认，避免误删。
     */
    probeReplyPresence(oid: number, type: number, rpid: number | string): Promise<"alive" | "gone" | "unknown">;
    private replyIdOf;
    private sameReplyId;
    private replyLooksMissing;
    private assertReplyProbeAllowed;
    private payloadHasReplyId;
    deleteReply(oid: string, type: number, rpid: number | string): Promise<void>;
    reportComment(oid: string, type: number, rpid: number | string, reason: number): Promise<void>;
    /** 网页评论翻译。未登录是 -101；评论不存在是 12006。译文在 translated_content.message */
    translateComment(oid: string, type: number, rpid: number | string): Promise<string>;
    private normalizeCommentPage;
    private asReplyRecords;
    private collectPinnedReplies;
    private rememberOwnComments;
    private normalizeCommentItem;
    private detectCommentPinKind;
    private extractCommentPictures;
    private extractCommentEmotes;
    private stripAtDisplayName;
    private isAtRichNodeType;
    private collectAtRichNodes;
    private collectCtrlMentions;
    private extractCommentMentions;
    private asPlainRecord;
    private mergeMentionLists;
    private extractDynamicMentions;
    private isEmojiRichNodeType;
    private normalizeEmoteToken;
    private addEmoteUrl;
    private collectEmojiUrls;
    private extractRichNodeEmotes;
    private mergeEmoteMaps;
    private extractDynamicEmotes;
    getReplyEmotes(): Promise<ReplyEmotePanel>;
    private buildPlayInfoFromDurl;
    private buildPlayInfoFromDash;
    private rememberPlayQualities;
    private withFullQualities;
    private subscribedSeasonsCache;
    private getDefaultFavFolderId;
    private fetchCollectedSeasonFolders;
    private loadSubscribedSeasonsFromFolders;
    private normalizeCollectedFolderAsSeason;
    private mapFavMedias;
    private fetchFavResourcePage;
    private mapFavFolder;
    getFavFolders(): Promise<FavFolder[]>;
    getVideoFavFolders(aid: number): Promise<VideoFavFolder[]>;
    setVideoFavFolders(aid: number, addMediaIds: number[], delMediaIds: number[]): Promise<void>;
    /** 新建 B 站收藏夹，对应官网 /x/v3/fav/folder/add */
    createFavFolder(payload: {
        title: string;
        intro?: string;
        privacy?: 0 | 1;
    }): Promise<FavFolder>;
    getFavFolderInfo(mediaId: number): Promise<FavFolder>;
    /** 编辑收藏夹名称 / 简介 / 公开性，对应官网 /x/v3/fav/folder/edit */
    editFavFolder(payload: {
        mediaId: number;
        title: string;
        intro?: string;
        privacy?: 0 | 1;
    }): Promise<FavFolder>;
    /** 删除空收藏夹，对应官网 /x/v3/fav/folder/del */
    deleteFavFolder(mediaId: number): Promise<void>;
    /** 一键清除收藏夹里已失效/下架的稿件，对应官网 /x/v3/fav/resource/clean */
    cleanFavResources(mediaId: number): Promise<{
        cleaned: number | null;
    }>;
    /** 调整收藏夹顺序，对应官网 /x/v3/fav/folder/sort */
    sortFavFolders(mediaIds: number[]): Promise<void>;
    /** 从指定收藏夹批量移除视频（resources 格式 aid:2） */
    removeFavResources(mediaId: number, aids: number[]): Promise<void>;
    /** 批量移动收藏：从源收藏夹移到目标收藏夹 */
    moveFavResources(srcMediaId: number, tarMediaId: number, aids: number[]): Promise<void>;
    getFavResources(mediaId: number, page?: number, pageSize?: number, riskRetry?: "short" | "long", expectedCount?: number): Promise<{
        resources: FavResource[];
        page: number;
        hasMore: boolean;
    }>;
    getAllFavResourcesInFolder(mediaId: number, onPage?: (fetchedCount: number) => void | Promise<void>): Promise<FavResource[]>;
    /** 扫描用：保留 medias 原始字段（含 attr）
     * soft=true 时遇 412 / 列表空返回已拉到的内容，不抛错，避免整次扫描中断
     */
    getAllFavMediaRawInFolder(mediaId: number, options?: {
        soft?: boolean;
    }): Promise<Record<string, unknown>[]>;
    getAllFavResources(): Promise<FavResource[]>;
    getFollowings(page?: number, order?: FollowingOrder): Promise<FollowingUp[]>;
    /** 分页拉全量关注，供失效/封禁扫描 */
    getAllFollowings(): Promise<FollowingUp[]>;
    /**
     * 账号状态：/x/space/wbi/acc/info 的 silence / is_deleted
     * silence=1 被封；is_deleted=1 注销；接口失败时标 unavailable
     */
    getUserAccountStatus(mid: number): Promise<{
        mid: number;
        name: string;
        face: string;
        silence: boolean;
        deleted: boolean;
        /** 被风控 / 限流拦下，状态未知，不能当成异常 */
        blocked: boolean;
    }>;
    /** 取 UP 最新一稿 + 最新一条动态的时间（活跃度页用） */
    getUpLatestActivity(mid: number): Promise<{
        latestVideoAt: number;
        latestVideoTitle: string;
        latestVideoBvid: string;
        latestDynamicAt: number;
        latestDynamicText: string;
        latestDynamicId: string;
    }>;
    /** 查看指定用户的关注 / 粉丝列表（含隐私校验） */
    getUserRelationList(mid: number, type: "followings" | "followers", page?: number): Promise<UserRelationListPage>;
    getFollowTags(): Promise<FollowTag[]>;
    /** 新建 B 站关注分组，对应官网 /x/relation/tag/create */
    createFollowTag(name: string): Promise<FollowTag>;
    getFollowingsInTag(tagId: number, page?: number, pageSize?: number, order?: FollowingOrder): Promise<FollowingsPage>;
    private mapFollowingUser;
    /** 重命名 B 站关注分组，对应官网 /x/relation/tag/update */
    renameFollowTag(tagId: number, name: string): Promise<void>;
    /** 删除 B 站关注分组，组内 UP 会回到默认分组 */
    deleteFollowTag(tagId: number): Promise<void>;
    private postRelationForm;
    /** 批量加入分组，保留 UP 原有的其它分组 */
    copyUsersToTag(tagId: number, mids: number[]): Promise<void>;
    /** 批量移出分组，只动这一个分组；不在其它分组的 UP 回到默认分组 */
    removeUsersFromTag(tagId: number, mids: number[]): Promise<void>;
    getUserFollowTags(mid: number): Promise<number[]>;
    setUserFollowTags(mid: number, tagIds: number[]): Promise<void>;
    /** 0 个人认证，1 机构认证。无认证说明时不标。 */
    private resolveOfficialType;
    getUpProfile(mid: number): Promise<UpProfile>;
    /** card / acc.info 的 live_room。liveStatus 为 1 才算正在播 */
    private readLivingRoom;
    private pickSpaceTopPhoto;
    getUpRelation(mid: number): Promise<UpRelation>;
    modifyFollow(mid: number, follow: boolean): Promise<void>;
    modifySpecialFollow(mid: number, special: boolean): Promise<void>;
    getBlacklist(page?: number, pageSize?: number): Promise<BlacklistPage>;
    modifyBlock(mid: number, block: boolean): Promise<void>;
    /** 分类任务批量调用：只打一枪空间接口；失败（多为限流）直接抛给调用方退避 */
    /**
     * UP 近期投稿标题，给关注分类用。
     * 空间投稿列表（wbi/arc/search）风控极严，批量抓几百位就被限流；
     * recArchivesByKeywords 不走 WBI、限流宽松，优先用它，再退到空间动态和投稿列表。
     */
    getRecentVideoTitles(mid: number, limit?: number): Promise<string[]>;
    private fetchRecArchiveTitles;
    private fetchDynamicVideoTitles;
    getUpVideos(mid: number, page?: number, order?: UpVideosOrder, keyword?: string, specialType?: string): Promise<UpVideosPage>;
    private withChargingSpecial;
    /** 备用列表没有 slist 时，用这个 UP 上次确认过的筛选，避免按钮时有时无 */
    private attachRememberedSpecials;
    private readStoredArcSpecials;
    /** 确认过的筛选记到本地。下次 arc/search 被限流，备用列表也能把按钮带上 */
    private rememberArcSpecials;
    private loadUpVideos;
    private fetchUpName;
    private upNameCache;
    /**
     * 空间 wbi 投稿从第 2 页起常返回 -403。
     * 这个接口不走 wbi，页码和总数与投稿页一致。
     */
    private fetchRecArchivePage;
    /** APP 空间投稿分页；需要 TV 登录的 access_key，否则会直接「请求错误」 */
    private fetchAppSpaceArchive;
    searchVideos(keyword: string, page?: number, order?: SearchOrder, apiStartPage?: number, pageSize?: number): Promise<SearchVideosPage>;
    searchArticles(keyword: string, page?: number, order?: SearchArticleOrder): Promise<SearchArticlesPage>;
    searchMedia(keyword: string, kind: SearchMediaKind, page?: number): Promise<SearchMediaPage>;
    searchLiveRooms(keyword: string, page?: number, order?: SearchLiveOrder): Promise<SearchLivePage>;
    /** 搜索联想：https://s.search.bilibili.com/main/suggest */
    getSearchSuggest(term: string): Promise<SearchSuggestItem[]>;
    searchUsers(keyword: string, page?: number, order?: SearchUserOrder, userType?: SearchUserTypeFilter): Promise<SearchUsersPage>;
    /** 用户搜索接口本身按整句去对名字。热搜常带「开播」之类的词，拆开再查。 */
    private extractUserSearchKeywords;
    /** 名字命中越多越靠前；粉丝数只在吻合程度接近时拉开差距。 */
    private scoreSearchUser;
    private searchUsersOnce;
    getSearchTypeCounts(keyword: string): Promise<SearchTypeCounts>;
    private normalizeSearchUser;
    private normalizeSearchMedia;
    private normalizeSearchLiveRoom;
    private normalizeSearchArticle;
    getArticle(id: number): Promise<ArticleDetail>;
    likeArticle(id: number, like: boolean): Promise<void>;
    coinArticle(id: number, upMid: number, multiply?: 1 | 2): Promise<void>;
    favoriteArticle(id: number, favorite: boolean): Promise<void>;
    private normalizeArticleDetail;
    private stripHtml;
    private fetchSearchApiPage;
    private readArcSpecials;
    private fetchSpaceArcList;
    private requestSpaceArcList;
    /** UP 投稿游标缓存：cursor 接口每段最多 20 条，按 30 条一页切片 */
    private upVideoCursorCache;
    private resolveVideoAid;
    private seedUpVideoCursor;
    private fetchSpaceArchiveCursor;
    private normalizeCursorSpaceVideo;
    private formatUserSpaceApiError;
    private spaceArcGate;
    private lastSpaceArcAt;
    /** 签名投稿接口返回 -403 后不再打，避免每次排序、翻页多一次请求 */
    private upArcSpecials;
    private upVideosInflight;
    /** 串行化空间投稿请求，避免短时间并发触发 -799 */
    private waitSpaceArcGate;
    private fetchMyArchives;
    private normalizeBfsUrl;
    private normalizeVideoCoverUrl;
    private normalizeArchiveAudit;
    private fetchUpVideosBySearch;
    /** 搜索结果按 mid 过滤后的投稿缓存（空间接口翻页失败时使用） */
    private upSearchVideoCache;
    private fetchUpVideosBySearchPaged;
    logout(): void;
    getAuthStatus(): UserInfo;
    private normalizeVideo;
    private normalizeSpaceVideo;
    private readChargeBadge;
    /** 列表里明确写了「不是充电」才记负缓存。搜索的 is_charge_video=0 不可信 */
    private chargeKnownOff;
    private withChargeBadge;
    private readChargeBadgeCache;
    private rememberChargeBadge;
    private rememberChargeBadges;
    /** 列表接口经常不带充电标记，用稿件详情补。失败的不写入缓存 */
    lookupChargeBadges(bvids: string[]): Promise<Record<string, string>>;
    private fetchChargeBadge;
    private mapLimit;
    private parseSpaceDuration;
    getToViewList(): Promise<ToViewList>;
    /** 稍后再看：附带失效判定（title / state） */
    getToViewListDetailed(): Promise<Array<ToViewItem & {
        invalid: boolean;
        reason?: string;
        state?: number;
    }>>;
    addToView(aid: number, bvid: string): Promise<void>;
    clearToView(): Promise<void>;
    removeFromToView(aid: number): Promise<void>;
    private isToViewFullMessage;
    private assertToViewMutationResponse;
    getSpaceDynamics(mid: number, offset?: string): Promise<SpaceDynamicPage>;
    getSpaceOpus(mid: number, offset?: string): Promise<SpaceOpusPage>;
    /** 关注动态流（官方「动态」页） */
    getFollowDynamics(offset?: string, type?: "all" | "video" | "article"): Promise<SpaceDynamicPage>;
    getDynamicDetail(id: string): Promise<SpaceDynamicItem>;
    private fetchPolymerDynamicItem;
    private mergeDynamicMeta;
    private uniqueImageUrls;
    private absHttpUrl;
    private isLikelyDynamicImageUrl;
    private extractImagesFromHtml;
    doDynamicVote(voteId: string, optionIdxs: number[]): Promise<DynamicVoteCard>;
    private fillVoteCard;
    private extractDynamicAttach;
    private extractDynamicVote;
    private extractDynamicLottery;
    private pickAttachButton;
    private normalizeHttpUrl;
    private enrichDynamicDetail;
    likeDynamic(id: string, like: boolean): Promise<void>;
    favoriteDynamic(id: string, favorite: boolean): Promise<void>;
    setDynamicTop(id: string, top: boolean): Promise<void>;
    removeDynamic(id: string): Promise<void>;
    /** 举报动态。reasonType 与网页三点菜单一致 */
    reportDynamic(id: string, accusedUid: number, reasonType: number): Promise<void>;
    /** 把这条动态上的装扮卡片设为自己的动态卡片背景 */
    equipDynamicCard(itemId: number): Promise<void>;
    getTargetComments(oid: string, type: number, page?: number, sort?: 0 | 1 | 2, offset?: string, seekRpid?: number): Promise<CommentPage>;
    getTargetCommentReplies(oid: string, type: number, root: number, page?: number): Promise<CommentPage>;
    addTargetComment(oid: string, type: number, message: string, root?: number, parent?: number, images?: BinaryImageFile[]): Promise<CommentItem | null>;
    private postReply;
    private uploadDrawImages;
    private postCreateDyn;
    private currentMid;
    private createVoteCard;
    private createLotteryCard;
    private createReserveCard;
    private buildDynContents;
    private composeDynReq;
    createDynamic(text: string, images?: BinaryImageFile[], options?: DynamicPublishOptions): Promise<CreatedDynamic>;
    editDynamic(id: string, text: string, images?: BinaryImageFile[], options?: DynamicPublishOptions): Promise<void>;
    setDynamicPrivate(id: string, privatePub: boolean): Promise<void>;
    searchTopics(keyword: string): Promise<TopicSuggest[]>;
    getTopicHead(topicId: number): Promise<TopicHead>;
    favoriteTopic(topicId: number, favorite: boolean): Promise<void>;
    repostDynamic(dynId: string, text?: string): Promise<CreatedDynamic>;
    getHotSearch(): Promise<HotSearchItem[]>;
    getTopicDynamics(topicId: number, offset?: string): Promise<SpaceDynamicPage>;
    getVideoChapters(bvid: string, cid: number): Promise<VideoChapter[]>;
    getDanmakuFilters(): Promise<DanmakuFilter[]>;
    addDanmakuFilter(text: string, kind?: DanmakuFilterKind): Promise<void>;
    removeDanmakuFilter(id: number): Promise<void>;
    likeDanmaku(cid: number, dmid: string, like: boolean): Promise<void>;
    recallDanmaku(cid: number, dmid: string): Promise<string>;
    reportDanmaku(cid: number, dmid: string, reason?: number): Promise<void>;
    likeTargetComment(oid: string, type: number, rpid: number, like: boolean): Promise<void>;
    /** 官方历史记录（与客户端历史同步） */
    getWatchHistory(type?: HistoryFeedType, cursor?: HistoryCursor, filters?: HistoryFilters): Promise<HistoryPage>;
    private historyNeedsScan;
    private matchHistoryFilters;
    private fetchHistoryCursorPage;
    private listWatchHistory;
    private searchWatchHistory;
    getHistoryShadow(): Promise<boolean>;
    setHistoryShadow(record: boolean): Promise<void>;
    /** 删除单条历史：kid 格式为 `{business}_{oid}` */
    deleteWatchHistory(item: {
        business: string;
        oid: number;
        kid?: number;
    }): Promise<void>;
    /** 清空全部历史记录 */
    clearWatchHistory(): Promise<void>;
    private normalizeHistoryItem;
    getUserCollections(mid: number, page?: number): Promise<UserCollectionsPage>;
    getSubscribedCollections(page?: number): Promise<UserCollectionsPage>;
    /** 是否已订阅该 UGC 合集（只查 collected 列表，避免扫全收藏夹） */
    getUgcSeasonSubscribed(seasonId: number): Promise<boolean>;
    /**
     * 订阅 / 取消订阅 UGC 合集
     * fav:   POST /x/v3/fav/season/fav
     * unfav: POST /x/v3/fav/season/unfav
     */
    setUgcSeasonSubscribe(seasonId: number, subscribe: boolean): Promise<boolean>;
    getFavVideoMedias(page?: number): Promise<FavMediasPage>;
    getOpusFavorites(page?: number): Promise<OpusFavPage>;
    getUpCourses(mid: number, page?: number): Promise<CheeseCoursePage>;
    getCheeseFollowList(page?: number, mid?: number): Promise<CheeseCoursePage>;
    getUpowerPaidList(): Promise<ChargeRecordResult>;
    private collectPaidPugvByKind;
    private mergeChargeRecords;
    private pickChargeHost;
    private chargeHostScore;
    private collapseDuplicateChargeUps;
    private chargeNamesRelated;
    private normalizeChargeName;
    private splitExclusivesByFollow;
    private fetchChargeUpList;
    private isChargeFollowActive;
    private fetchCheesePaidList;
    private fetchCheeseFavoriteList;
    getSeasonArchives(mid: number, seasonId: number, page?: number): Promise<UpVideosPage>;
    /** 收藏夹里的合集接口：不需要 WBI，风控比空间接口宽松 */
    getFavSeasonArchives(seasonId: number, page?: number, pageSize?: number): Promise<UpVideosPage>;
    getSeriesArchives(seriesId: number, page?: number): Promise<UpVideosPage>;
    getBangumiFollowList(mid: number, type?: 1 | 2, page?: number): Promise<BangumiFollowPage>;
    private normalizeArchivesPage;
    private normalizeArchiveVideo;
    private parseCollectionList;
    private normalizeCollectionItem;
    private normalizeSubscribedSeason;
    private normalizeFavMediaItem;
    private normalizeOpusFavItem;
    private normalizeCheeseCourseItem;
    /** 课堂 status=10 等是内部码；充电专属常给 play/status = -1 */
    private normalizeCheeseStatus;
    private extractPugvMid;
    /** true 已过期；false 仍有效；null 字段里看不出来 */
    private isPugvAccessExpired;
    private firstPugvBvid;
    /**
     * 充电专属是 UGC 合集，不是课堂。
     * /cheese/play/ss{id} 对充电合集会返回 6009083「由于版权原因…」空页。
     */
    private resolvePugvUrl;
    private detectPugvKind;
    private normalizeBangumiItem;
    private extractRichText;
    private extractRichTextNode;
    private isPicPlaceholder;
    private stripPicPlaceholders;
    private collectDynamicImages;
    private collectRichImageUrls;
    private pickDynamicModule;
    private extractPubLocation;
    private normalizeLocationText;
    private extractPubLocationFromUnknown;
    private asCvId;
    private extractDynamicCvId;
    private extractCvFromUnknown;
    private parseUgcSeasonPubAction;
    private extractBvidFromUrl;
    private extractSpaceMid;
    private normalizeSpaceDynamicItem;
    private pickDynText;
    private extractDynamicPinned;
    private extractDecorationCard;
    private extractExclusiveTag;
    private extractUpowerPreview;
    private normalizeChargeJumpUrl;
    private normalizeOrigDynamic;
    private parseDynamicDuration;
    private extractLiveDynamic;
    private formatDynamicPubTime;
    private getDynamicPubAction;
    private normalizeToViewItem;
    private isSearchVideoResult;
    private normalizeSearchVideo;
}
export declare const biliApi: BiliApiService;
export {};
