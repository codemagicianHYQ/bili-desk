export interface VideoItem {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  duration: number;
  play: number;
  danmaku: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  pubdate: number;
}

export interface VideoDetail extends VideoItem {
  desc: string;
  pages: VideoPagePart[];
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
}

/** 播放器弹幕（对齐 artplayer-plugin-danmuku） */
export interface DanmakuItem {
  text: string;
  time: number;
  color?: string;
  border?: boolean;
  /** 0=滚动 1=顶部 2=底部 */
  mode?: 0 | 1 | 2;
}

export interface SendDanmakuPayload {
  cid: number;
  bvid: string;
  /** 进度，毫秒 */
  progress: number;
  message: string;
  /** 1=滚动 4=底 5=顶 */
  mode?: number;
  color?: number;
  fontsize?: number;
}

/** 用户对本稿的互动状态 */
export interface VideoRelation {
  liked: boolean;
  coined: boolean;
  /** 已投币数量 0/1/2 */
  coin: number;
  favorited: boolean;
}

export interface AddCoinPayload {
  aid: number;
  bvid: string;
  /** 1 或 2 */
  multiply: 1 | 2;
  /** 投币同时点赞 */
  selectLike?: boolean;
}

/** 同步观看历史 / 播放心跳 */
export interface WatchHeartbeatPayload {
  aid: number;
  bvid: string;
  cid: number;
  /** 当前进度（秒）；播完可传 -1 */
  playedTime: number;
  /** 0 播放中 / 1 开始 / 2 暂停 / 3 继续 */
  playType: 0 | 1 | 2 | 3;
  /** 本轮会话开始时间戳（秒） */
  startTs: number;
  /** 本轮真实播放时长（秒） */
  realtime?: number;
  quality?: number;
}

export interface CommentMember {
  mid: number;
  name: string;
  face: string;
  level?: number;
  sex?: string;
}

export interface CommentItem {
  rpid: number;
  oid: number;
  mid: number;
  root: number;
  parent: number;
  content: string;
  like: number;
  action: number;
  ctime: number;
  rcount: number;
  member: CommentMember;
  replies: CommentItem[];
}

export interface CommentPage {
  comments: CommentItem[];
  page: number;
  pageSize: number;
  count: number;
  acount: number;
  hasMore: boolean;
}

export interface VideoPagePart {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface VideoPlayInfo {
  url: string;
  format: "mp4" | "flv" | "dash";
  quality: number;
  qualityLabel: string;
  qualities: Array<{ qn: number; label: string }>;
}

export interface UserInfo {
  mid: number;
  name: string;
  face: string;
  isLogin: boolean;
}

export interface QrLoginResult {
  url: string;
  qrcodeKey: string;
}

export interface AuthPollResult {
  status: "waiting" | "scanned" | "confirmed" | "expired" | "failed";
  user?: UserInfo;
  message?: string;
}

export interface FavFolder {
  id: number;
  fid: number;
  title: string;
  mediaCount: number;
  cover: string;
}

export interface VideoFavFolder extends FavFolder {
  collected: boolean;
  isDefault?: boolean;
}

export interface FavResource {
  id: number;
  bvid: string;
  title: string;
  cover: string;
  upper: { mid: number; name: string };
  duration: number;
}

export interface FavResourcesPage {
  resources: FavResource[];
  page: number;
  hasMore: boolean;
}

export interface FollowingUp {
  mid: number;
  uname: string;
  face: string;
  sign: string;
  official: { role: number; title: string };
  /** 是否特别关注 */
  special?: boolean;
  /** 是否互相关注 */
  mutual?: boolean;
}

export interface FollowTag {
  tagId: number;
  name: string;
  count: number;
}

export interface FollowingsPage {
  followings: FollowingUp[];
  page: number;
  hasMore: boolean;
}

export interface UpProfile {
  mid: number;
  name: string;
  face: string;
  sign: string;
  fans: number;
  following: number;
  videos: number;
  topPhoto?: string;
}

export interface UpRelation {
  isFollowing: boolean;
  attribute: number;
}

export interface UpVideosPage {
  videos: VideoItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

/** UP 主投稿排序：最新发布 / 最多播放 */
export type UpVideosOrder = "pubdate" | "click";

export interface RecommendPage {
  videos: VideoItem[];
  freshIdx: number;
  hasMore: boolean;
}

export type SearchOrder = "totalrank" | "click" | "pubdate" | "dm" | "stow";

export interface SearchVideosPage {
  videos: VideoItem[];
  page: number;
  hasMore: boolean;
  total: number;
  nextApiPage?: number;
}

export interface ToViewItem extends VideoItem {
  progress: number;
  addAt: number;
  cid: number;
}

export interface ToViewList {
  videos: ToViewItem[];
  count: number;
}

export interface SpaceDynamicItem {
  id: string;
  type: string;
  kind: "video" | "opus" | "text" | "forward";
  text: string;
  pubTime: number;
  pubTimeLabel?: string;
  pubAction?: string;
  authorName?: string;
  authorFace?: string;
  cover?: string;
  bvid?: string;
  title?: string;
  duration?: number;
  stats?: {
    view?: number;
    like?: number;
    reply?: number;
    danmaku?: number;
  };
}

export interface SpaceDynamicPage {
  items: SpaceDynamicItem[];
  offset: string;
  hasMore: boolean;
}

export interface UserCollectionItem {
  id: number;
  kind: "season" | "series";
  title: string;
  cover: string;
  description: string;
  total: number;
  /** 订阅/收藏他人的合集时，创建者 mid */
  ownerMid?: number;
  source?: "created" | "subscribed";
}

export interface FavMediaItem {
  id: number;
  type: number;
  title: string;
  cover: string;
  intro: string;
  link: string;
  bvid: string;
  upper: { mid: number; name: string };
  duration: number;
  playCount: number;
  favTime: number;
}

export interface FavMediasPage {
  items: FavMediaItem[];
  page: number;
  hasMore: boolean;
}

export interface OpusFavItem {
  id: string;
  title: string;
  cover: string;
  summary: string;
  url: string;
  author: string;
}

export interface OpusFavPage {
  items: OpusFavItem[];
  page: number;
  hasMore: boolean;
}

export interface CheeseCourseItem {
  seasonId: number;
  title: string;
  cover: string;
  subtitle: string;
  epCount: number;
  playCount: number;
  status: string;
  url: string;
}

export interface CheeseCoursePage {
  list: CheeseCourseItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface UserCollectionsPage {
  seasons: UserCollectionItem[];
  series: UserCollectionItem[];
  page: number;
  hasMore: boolean;
}

export interface BangumiFollowItem {
  seasonId: number;
  title: string;
  cover: string;
  evaluate: string;
  progress: string;
  url: string;
}

export interface BangumiFollowPage {
  list: BangumiFollowItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface CategoryL1 {
  id: number;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface CategoryL2 {
  id: number;
  categoryL1Id: number;
  name: string;
  sortOrder: number;
}

export interface CategoryL3 {
  id: number;
  categoryL2Id: number;
  name: string;
  sortOrder: number;
}

export interface CategoryTreeL3Node {
  id: number;
  name: string;
  sortOrder: number;
  count?: number;
}

export interface CategoryTreeL2Node {
  id: number;
  name: string;
  sortOrder: number;
  count?: number;
  children: CategoryTreeL3Node[];
}

export interface CategoryTreeNode {
  id: number;
  name: string;
  icon: string;
  sortOrder: number;
  count?: number;
  children: CategoryTreeL2Node[];
}

export interface FavoriteItemAssignment {
  id: number;
  mediaId: number;
  avid: number;
  bvid: string;
  title: string;
  cover?: string;
  upperName?: string;
  duration?: number;
  categoryL1Id: number | null;
  categoryL2Id: number | null;
  categoryL3Id: number | null;
}

export type LocalCategoryLevel = "all" | "l1" | "l2" | "l3" | "uncategorized";

export interface LocalCategorySelection {
  level: LocalCategoryLevel;
  id: number | null;
}

export interface UpGroup {
  id: number;
  name: string;
  color: string;
  isAiGenerated: boolean;
  sortOrder: number;
  parentId: number | null;
  memberCount: number;
}

export interface UpGroupTreeL2Node {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  count: number;
}

export interface UpGroupTreeNode {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  count: number;
  children: UpGroupTreeL2Node[];
}

export type UpGroupSelectionLevel = "all" | "l1" | "l2" | "uncategorized";

export interface UpGroupSelection {
  level: UpGroupSelectionLevel;
  id: number | null;
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ClassificationTask {
  id: number;
  type: string;
  status: "pending" | "running" | "done" | "failed";
  progress: number;
  message: string;
}

export type Theme = "light" | "dark";

export interface BiliDeskApi {
  auth: {
    getQrCode: () => Promise<QrLoginResult>;
    pollLogin: (qrcodeKey: string) => Promise<AuthPollResult>;
    logout: () => Promise<void>;
    getStatus: () => Promise<UserInfo>;
  };
  bili: {
    getRecommend: (options?: {
      freshIdx?: number;
      freshIdx1h?: number;
      ps?: number;
    }) => Promise<RecommendPage>;
    getVideo: (bvid: string) => Promise<VideoDetail>;
    getPlayUrl: (
      bvid: string,
      cid: number,
      qn?: number,
    ) => Promise<VideoPlayInfo>;
    getVideoRelation: (bvid: string, aid: number) => Promise<VideoRelation>;
    likeVideo: (aid: number, like: boolean) => Promise<void>;
    addCoin: (payload: AddCoinPayload) => Promise<void>;
    shareVideo: (aid: number, bvid: string) => Promise<void>;
    reportWatchHeartbeat: (payload: WatchHeartbeatPayload) => Promise<void>;
    getDanmakuList: (cid: number) => Promise<DanmakuItem[]>;
    sendDanmaku: (payload: SendDanmakuPayload) => Promise<void>;
    getComments: (
      aid: number,
      page?: number,
      sort?: 0 | 1 | 2,
    ) => Promise<CommentPage>;
    getCommentReplies: (
      aid: number,
      root: number,
      page?: number,
    ) => Promise<CommentPage>;
    addComment: (
      aid: number,
      message: string,
      root?: number,
      parent?: number,
    ) => Promise<void>;
    likeComment: (aid: number, rpid: number, like: boolean) => Promise<void>;
    getFavFolders: () => Promise<FavFolder[]>;
    getVideoFavFolders: (aid: number) => Promise<VideoFavFolder[]>;
    setVideoFavFolders: (
      aid: number,
      addMediaIds: number[],
      delMediaIds: number[],
    ) => Promise<void>;
    getFavResources: (
      mediaId: number,
      page?: number,
    ) => Promise<FavResourcesPage>;
    getFollowings: (page?: number) => Promise<FollowingUp[]>;
    getFollowTags: () => Promise<FollowTag[]>;
    getFollowingsInTag: (
      tagId: number,
      page?: number,
    ) => Promise<FollowingsPage>;
    getUserFollowTags: (mid: number) => Promise<number[]>;
    setUserFollowTags: (mid: number, tagIds: number[]) => Promise<void>;
    getUpProfile: (mid: number) => Promise<UpProfile>;
    getUpRelation: (mid: number) => Promise<UpRelation>;
    modifyFollow: (mid: number, follow: boolean) => Promise<void>;
    getUpVideos: (
      mid: number,
      page?: number,
      order?: UpVideosOrder,
    ) => Promise<UpVideosPage>;
    searchVideos: (
      keyword: string,
      page?: number,
      order?: SearchOrder,
      apiStartPage?: number,
      pageSize?: number,
    ) => Promise<SearchVideosPage>;
    getToViewList: () => Promise<ToViewList>;
    addToView: (aid: number, bvid: string) => Promise<void>;
    removeFromToView: (aid: number) => Promise<void>;
    getSpaceDynamics: (
      mid: number,
      offset?: string,
    ) => Promise<SpaceDynamicPage>;
    getUserCollections: (
      mid: number,
      page?: number,
    ) => Promise<UserCollectionsPage>;
    getSeasonArchives: (
      mid: number,
      seasonId: number,
      page?: number,
    ) => Promise<UpVideosPage>;
    getSeriesArchives: (
      seriesId: number,
      page?: number,
    ) => Promise<UpVideosPage>;
    getBangumiFollowList: (
      mid: number,
      type?: 1 | 2,
      page?: number,
    ) => Promise<BangumiFollowPage>;
    getSubscribedCollections: (page?: number) => Promise<UserCollectionsPage>;
    getFavVideoMedias: (page?: number) => Promise<FavMediasPage>;
    getOpusFavorites: (page?: number) => Promise<OpusFavPage>;
    getCheeseFollowList: (
      page?: number,
      mid?: number,
    ) => Promise<CheeseCoursePage>;
  };
  taxonomy: {
    getTree: () => Promise<CategoryTreeNode[]>;
    createL1: (name: string, icon?: string) => Promise<CategoryL1>;
    createL2: (categoryL1Id: number, name: string) => Promise<CategoryL2>;
    createL3: (categoryL2Id: number, name: string) => Promise<CategoryL3>;
    updateCategoryName: (
      level: "l1" | "l2" | "l3",
      id: number,
      name: string,
    ) => Promise<void>;
    getFavoriteAssignments: () => Promise<FavoriteItemAssignment[]>;
    classifyAllFavorites: () => Promise<{ taskId: number }>;
    classifyFolderFavorites: (mediaId: number) => Promise<{ taskId: number }>;
    getFavTaskStatus: (taskId: number) => Promise<ClassificationTask | null>;
    enrichFavoriteCovers: () => Promise<{ updated: number; remaining: number }>;
    getUpGroups: () => Promise<UpGroup[]>;
    getUpGroupTree: () => Promise<UpGroupTreeNode[]>;
    createUpGroup: (name: string, color?: string) => Promise<UpGroup>;
    getUpGroupMemberMids: (selection: UpGroupSelection) => Promise<number[]>;
  };
  ai: {
    getConfig: () => Promise<AiConfig>;
    setConfig: (config: Partial<AiConfig>) => Promise<AiConfig>;
    runUpClassification: () => Promise<{ taskId: number }>;
    getTaskStatus: (taskId: number) => Promise<ClassificationTask | null>;
  };
  app: {
    getTheme: () => Promise<Theme>;
    setTheme: (theme: Theme) => Promise<Theme>;
  };
}

declare global {
  interface Window {
    biliDesk: BiliDeskApi;
  }
}

export {};
