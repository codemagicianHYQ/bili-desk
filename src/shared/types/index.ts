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

export type VideoTagKind = "normal" | "topic" | "channel" | "bgm";

/** 稿件标签（官网简介下方胶囊） */
export interface VideoTag {
  id: number;
  name: string;
  kind: VideoTagKind;
  jumpUrl?: string;
  cover?: string;
}

export interface VideoDetail extends VideoItem {
  desc: string;
  pages: VideoPagePart[];
  tags: VideoTag[];
  /** 所属合集；无则 undefined */
  ugcSeason?: VideoUgcSeason;
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
  /** 硬核会员：官网 LV6 旁带闪电 */
  isSeniorMember?: boolean;
  sex?: string;
}

export interface CommentPicture {
  src: string;
  width: number;
  height: number;
}

export interface CommentItem {
  rpid: number;
  /** 评论 rpid 原始字符串，删除/点踩等接口优先用这个 */
  rpidStr?: string;
  oid: number;
  mid: number;
  root: number;
  parent: number;
  content: string;
  /** 评论里 @ 到的用户，用来把 `@昵称` 链到空间 */
  mentions?: CommentMember[];
  /** 评论里出现的表情：`[doge]` → 图片 URL */
  emotes?: Record<string, string>;
  /** 评论附图 */
  pictures?: CommentPicture[];
  /** IP 属地，如「江苏」 */
  location?: string;
  like: number;
  action: number;
  ctime: number;
  rcount: number;
  member: CommentMember;
  replies: CommentItem[];
  /** UP / 管理置顶，出现在评论区最上方 */
  pinned?: boolean;
  pinKind?: "upper" | "admin" | "vote";
}

export interface CommentPage {
  comments: CommentItem[];
  page: number;
  pageSize: number;
  count: number;
  acount: number;
  hasMore: boolean;
  /** wbi/main 翻页游标，下一页要原样回传 */
  nextOffset?: string;
}

/** 评论表情面板（官网按 pack 分组） */
export interface ReplyEmoteItem {
  text: string;
  url: string;
  /** 4 = 颜文字 */
  type: number;
  /** 1 小黄脸 / 2 大贴纸 */
  size: 1 | 2;
}

export interface ReplyEmotePackage {
  id: number;
  name: string;
  icon: string;
  /** 4 = 颜文字 */
  type: number;
  emotes: ReplyEmoteItem[];
}

export interface ReplyEmotePanel {
  packages: ReplyEmotePackage[];
  map: Record<string, string>;
}

export interface VideoPagePart {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

/** 稿件所属 UGC 合集中的一集（不同 BV） */
export interface VideoSeasonEpisode {
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  cover: string;
  /** 秒 */
  duration: number;
}

/** /x/web-interface/view 的 ugc_season */
export interface VideoUgcSeason {
  id: number;
  title: string;
  cover: string;
  epCount: number;
  episodes: VideoSeasonEpisode[];
  /** 合集作者 mid */
  mid?: number;
  /** 合集总播放 */
  view?: number;
  /** 简介 */
  intro?: string;
}

export interface BiliDashTrackInfo {
  url: string;
  backupUrls?: string[];
  referer: string;
  mimeType: string;
  codecs: string;
  initRange: string;
  indexRange: string;
}

export interface BiliDashPlayInfo {
  duration: number;
  video: BiliDashTrackInfo;
  audio: BiliDashTrackInfo;
}

export interface VideoPlayQuality {
  qn: number;
  label: string;
  needVip?: boolean;
  needLogin?: boolean;
  superscript?: string;
}

export interface VideoPlayInfo {
  url: string;
  format: "mp4" | "flv" | "dash";
  quality: number;
  qualityLabel: string;
  qualities: VideoPlayQuality[];
  /** DASH 音视频轨：由主进程 IPC 拉分片，不走 dash.js 跨域 */
  dash?: BiliDashPlayInfo;
  /** 当前登录账号是否为有效大会员 */
  isVip?: boolean;
  /** 高画质试看是否仍可用（普通会员每月 5 次） */
  trialAble?: boolean;
  /** 高画质试看剩余次数；null 表示接口未返回 */
  trialRemaining?: number | null;
  /** 请求了大会员画质但服务端未授权 */
  qualityDenied?: boolean;
  /** 播放器内提示：试看剩余 / 请开通大会员 */
  qualityNotice?: string;
}

export interface UserInfo {
  mid: number;
  name: string;
  face: string;
  isLogin: boolean;
  isVip?: boolean;
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
  intro?: string;
  /** 0 公开，1 私密 */
  privacy?: 0 | 1;
  isDefault?: boolean;
}

export interface CreateFavFolderPayload {
  title: string;
  intro?: string;
  /** 0 公开，1 私密 */
  privacy?: 0 | 1;
}

export interface EditFavFolderPayload {
  mediaId: number;
  title: string;
  intro?: string;
  /** 0 公开，1 私密 */
  privacy?: 0 | 1;
}

export interface SuggestFavFolderPayload {
  aid?: number;
  title: string;
  intro?: string;
  ownerName?: string;
  folderTitles: string[];
}

export interface SuggestFavFolderResult {
  title: string;
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
  intro?: string;
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
  /** 当前登录用户是否已关注该用户 */
  isFollowing?: boolean;
}

export interface FollowTag {
  tagId: number;
  name: string;
  count: number;
}

/** B 站系统分组：特别关注 */
export const BILI_SPECIAL_FOLLOW_TAG_ID = -10;

export interface BlacklistUser extends FollowingUp {
  /** 拉黑时间，秒级时间戳 */
  blockedAt?: number;
}

export interface BlacklistPage {
  users: BlacklistUser[];
  page: number;
  total: number;
  hasMore: boolean;
}

export interface FollowingsPage {
  followings: FollowingUp[];
  page: number;
  hasMore: boolean;
}

/** 指定用户的关注 / 粉丝列表分页 */
export interface UserRelationListPage {
  users: FollowingUp[];
  page: number;
  total: number;
  hasMore: boolean;
  /** 对方隐私设置导致不可见（业务结果，不是异常） */
  privacyBlocked?: boolean;
  message?: string;
}

export type UserRelationListType = "followings" | "followers";

export interface UpProfile {
  mid: number;
  name: string;
  face: string;
  sign: string;
  fans: number;
  following: number;
  videos: number;
  /** 用户等级 0-6 */
  level?: number;
  /** 认证/官方称号 */
  officialDesc?: string;
  /** 获赞数 */
  likes?: number;
  /** 稿件总播放 */
  archiveViews?: number;
  /** 公开收藏夹数量 */
  favourites?: number;
  /** 空间头图（官网主页背景） */
  topPhoto?: string;
  /** IP 属地，如「广东」 */
  ipLocation?: string;
  /** 专栏数 */
  articleCount?: number;
  /** 图文 / opus 数 */
  opusCount?: number;
  /** 合集 + 系列数 */
  seasonCount?: number;
  /** 课堂 / 充电相关 pugv 数 */
  pugvCount?: number;
  /** 该 UP 是否开通充电 */
  upowerEnabled?: boolean;
}

export interface UpRelation {
  isFollowing: boolean;
  attribute: number;
  /** 是否特别关注（系统分组 tagid=-10） */
  special?: boolean;
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

/** 热门 / 每周必看 / 入站必刷 / 排行榜 共用卡片 */
export interface PopularVideoItem extends VideoItem {
  reply: number;
  like: number;
  share: number;
  /** 例如「6万点赞」「1万分享」 */
  rcmdReason?: string;
  rank?: number;
}

export interface PopularFeedPage {
  videos: PopularVideoItem[];
  page: number;
  hasMore: boolean;
}

export interface WeeklySeriesMeta {
  number: number;
  name: string;
  subject: string;
  status: number;
}

export interface WeeklySeriesDetail {
  number: number;
  name: string;
  subject: string;
  reminder?: string;
  videos: PopularVideoItem[];
}

export interface PreciousVideosPage {
  title: string;
  explain: string;
  videos: PopularVideoItem[];
}

export interface RankingPartition {
  rid: number;
  label: string;
}

export const RANKING_PARTITIONS: RankingPartition[] = [
  { rid: 0, label: "全站" },
  { rid: 1, label: "动画" },
  { rid: 168, label: "国创相关" },
  { rid: 3, label: "音乐" },
  { rid: 129, label: "舞蹈" },
  { rid: 4, label: "游戏" },
  { rid: 36, label: "知识" },
  { rid: 188, label: "科技" },
  { rid: 234, label: "运动" },
  { rid: 223, label: "汽车" },
  { rid: 160, label: "生活" },
  { rid: 211, label: "美食" },
  { rid: 217, label: "动物圈" },
  { rid: 119, label: "鬼畜" },
  { rid: 155, label: "时尚" },
  { rid: 5, label: "娱乐" },
  { rid: 181, label: "影视" },
];

export interface MusicRankPeriod {
  listId: number;
  period: number;
  publishTime: number;
}

export interface MusicRankItem {
  rank: number;
  musicId: string;
  title: string;
  singer: string;
  cover: string;
  heat: number;
  bvid: string;
  aid: number;
  upName: string;
  play: number;
  duration: number;
  reason: string;
}

/** 直播间卡片（推荐 / 关注中） */
export interface LiveRoomItem {
  roomId: number;
  title: string;
  cover: string;
  online: number;
  onlineText?: string;
  areaName: string;
  parentAreaName?: string;
  uid: number;
  uname: string;
  face: string;
  /** 1 直播中 / 0 未开播 / 2 轮播 */
  liveStatus: number;
  keyframe?: string;
}

export interface LiveRecommendPage {
  rooms: LiveRoomItem[];
  page: number;
  hasMore: boolean;
}

export interface FollowingLivePage {
  rooms: LiveRoomItem[];
  count: number;
}

export interface LiveRoomDetail {
  roomId: number;
  shortId?: number;
  title: string;
  cover: string;
  online: number;
  areaName: string;
  parentAreaName?: string;
  liveStatus: number;
  liveStartTime?: number;
  description?: string;
  uid: number;
  uname: string;
  face: string;
}

export interface LivePlayInfo {
  url: string;
  format: "flv" | "hls";
  quality: number;
  qualityLabel: string;
  qualities: Array<{ qn: number; label: string }>;
}

export type SearchOrder = "totalrank" | "click" | "pubdate" | "dm" | "stow";

export type SearchCategory =
  | "all"
  | "video"
  | "bangumi"
  | "media"
  | "live"
  | "article"
  | "user";

/** 用户搜索排序：默认 / 粉丝高低 / 等级高低 */
export type SearchUserOrder =
  | "default"
  | "fans_desc"
  | "fans_asc"
  | "level_desc"
  | "level_asc";

/** 用户分类：全部 / UP主 / 普通 / 认证 */
export type SearchUserTypeFilter = 0 | 1 | 2 | 3;

export interface SearchVideosPage {
  videos: VideoItem[];
  page: number;
  hasMore: boolean;
  total: number;
  nextApiPage?: number;
}

export interface SearchUserItem {
  mid: number;
  name: string;
  face: string;
  sign: string;
  fans: number;
  videos: number;
  level: number;
  isUp: boolean;
  isLive: boolean;
  roomId?: number;
  officialDesc?: string;
  isFollowing: boolean;
}

export interface SearchUsersPage {
  users: SearchUserItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export type SearchArticleOrder =
  | "totalrank"
  | "click"
  | "pubdate"
  | "attention"
  | "scores";

export interface SearchArticleItem {
  id: number;
  title: string;
  desc: string;
  cover: string;
  covers: string[];
  mid: number;
  author: string;
  view: number;
  like: number;
  reply: number;
  pubTime: number;
  categoryName?: string;
  url: string;
}

export interface ArticleDetail {
  id: number;
  title: string;
  summary: string;
  content: string;
  banner: string;
  images: string[];
  mid: number;
  author: string;
  authorFace: string;
  view: number;
  like: number;
  reply: number;
  coin: number;
  favorite: number;
  share: number;
  words: number;
  pubTime: number;
  liked: boolean;
  /** 已迁到图文动态时的 dyn/opus id */
  dynId?: string;
  categoryName?: string;
}

export interface SearchArticlesPage {
  articles: SearchArticleItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

/** 番剧 / 影视搜索条目（search_type=media_bangumi | media_ft） */
export type SearchMediaKind = "bangumi" | "media";

export interface SearchMediaItem {
  seasonId: number;
  mediaId: number;
  title: string;
  cover: string;
  styles: string;
  areas: string;
  desc: string;
  /** 如「更新至第 12 话」 */
  indexShow: string;
  score: number;
  pubtime: number;
  url: string;
  kind: SearchMediaKind;
}

export interface SearchMediaPage {
  items: SearchMediaItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export type SearchLiveOrder = "online" | "live_time";

export interface SearchLiveItem {
  roomId: number;
  title: string;
  cover: string;
  online: number;
  uname: string;
  face: string;
  areaName: string;
  liveTime?: number;
}

export interface SearchLivePage {
  rooms: SearchLiveItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface SearchSuggestItem {
  /** 纯文本建议词 */
  value: string;
  /** 带高亮标记的展示（可选，前端也可自行高亮） */
  name?: string;
}

export interface SearchTypeCounts {
  video: number;
  bangumi: number;
  media: number;
  live: number;
  article: number;
  user: number;
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

export type ToViewSource = "official" | "local";

export interface ToViewAddResult {
  source: ToViewSource;
  item?: ToViewItem;
}

export interface SpaceDynamicItem {
  id: string;
  type: string;
  kind:
    | "video"
    | "opus"
    | "text"
    | "draw"
    | "live"
    | "forward"
    | "article"
    | "upower";
  text: string;
  /** 正文里真实存在的 @用户，有 mid 才可点进主页 */
  mentions?: CommentMember[];
  /** 正文里的表情：`[打call]` → 图片 URL */
  emotes?: Record<string, string>;
  pubTime: number;
  pubTimeLabel?: string;
  pubAction?: string;
  authorMid?: number;
  authorName?: string;
  authorFace?: string;
  cover?: string;
  /** 图文多图 */
  images?: string[];
  /** 发布 IP 属地，如「辽宁」 */
  ipLocation?: string;
  /** 专栏 cv 号，投稿文章动态会有 */
  cvId?: number;
  bvid?: string;
  title?: string;
  duration?: number;
  /** 评论区 oid（可能是动态 id / avid / 相簿 id 等大整数，必须用字符串） */
  commentId?: string;
  /** 评论区 type：1 视频 / 11 相簿 / 12 专栏 / 17 动态文字等 */
  commentType?: number;
  /** 当前用户是否已点赞该动态 */
  liked?: boolean;
  /** 直播间号 / 跳转 */
  liveRoomId?: number;
  liveUrl?: string;
  liveState?: number;
  /** 时间旁的粉标，如「充电专属」 */
  exclusiveTag?: string;
  /** 充电卡按钮文案，如「88元充电」 */
  chargeButton?: string;
  /** 充电落地页 / H5 */
  chargeUrl?: string;
  stats?: {
    view?: number;
    like?: number;
    reply?: number;
    danmaku?: number;
    forward?: number;
  };
  /** 转发动态里被转的原内容 */
  orig?: SpaceDynamicItem;
}

export type DynamicFeedType = "all" | "video" | "article";

export interface SpaceDynamicPage {
  items: SpaceDynamicItem[];
  offset: string;
  hasMore: boolean;
  updateBaseline?: string;
  updateNum?: number;
}

/** 历史记录分类（对应接口 type） */
export type HistoryFeedType = "all" | "archive" | "live" | "article";

/** 时长筛选，语义对齐全站搜索 duration */
export type HistoryDurationFilter = 0 | 1 | 2 | 3 | 4;

/** 设备筛选（映射 history.dt） */
export type HistoryDeviceFilter = "all" | "pc" | "phone" | "pad" | "tv";

export interface HistoryCursor {
  max: number;
  viewAt: number;
  business: string;
}

export interface HistoryFilters {
  keyword?: string;
  /** 搜索接口页码 pn；无关键词时忽略 */
  page?: number;
  duration?: HistoryDurationFilter;
  device?: HistoryDeviceFilter;
  /** 观看时间下限（秒） */
  fromTime?: number;
  /** 观看时间上限（秒） */
  toTime?: number;
}

export interface HistoryItem {
  id: string;
  kid: number;
  title: string;
  cover: string;
  covers?: string[];
  authorName: string;
  authorFace: string;
  authorMid: number;
  viewAt: number;
  progress: number;
  duration: number;
  showTitle?: string;
  badge?: string;
  tagName?: string;
  liveStatus?: number;
  business: string;
  bvid?: string;
  oid: number;
  cid?: number;
  uri?: string;
  /** 观看设备代码：1/3/5/7 手机，2 PC，4/6 平板，33 TV */
  dt?: number;
  favorited?: boolean;
}

export interface HistoryPage {
  items: HistoryItem[];
  cursor: HistoryCursor;
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

export interface SpaceOpusPage {
  items: OpusFavItem[];
  offset: string;
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
  /** cheese 课堂；upower 充电专属，不属于课堂 */
  kind: "cheese" | "upower";
  /** UP mid，充电专属用来拼空间合集链接、核对是否仍在包月 */
  mid?: number;
  /** 已过期（充电未续费）；充电 tab 放进「已过期」 */
  expired?: boolean;
}

export interface CheeseCoursePage {
  list: CheeseCourseItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

/** 我的充电：包月充电过的 UP，专属合集挂在对应 UP 下 */
export interface ChargeUpItem {
  mid: number;
  name: string;
  face: string;
  expireTime: number;
  privilegeName: string;
  url: string;
  expired: boolean;
  exclusives: CheeseCourseItem[];
}

export interface ChargeRecordResult {
  active: ChargeUpItem[];
  expired: ChargeUpItem[];
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
    getPopularVideos: (page?: number) => Promise<PopularFeedPage>;
    getWeeklySeriesList: () => Promise<WeeklySeriesMeta[]>;
    getWeeklySeries: (number: number) => Promise<WeeklySeriesDetail>;
    getPreciousVideos: () => Promise<PreciousVideosPage>;
    getRankingVideos: (rid?: number) => Promise<PopularVideoItem[]>;
    getMusicRankPeriods: () => Promise<MusicRankPeriod[]>;
    getMusicRankList: (listId: number) => Promise<MusicRankItem[]>;
    getLiveRecommend: (page?: number) => Promise<LiveRecommendPage>;
    getFollowingLives: () => Promise<FollowingLivePage>;
    getLiveRoom: (roomId: number) => Promise<LiveRoomDetail>;
    getLivePlayUrl: (roomId: number, qn?: number) => Promise<LivePlayInfo>;
    getVideo: (bvid: string) => Promise<VideoDetail>;
    getPlayUrl: (
      bvid: string,
      cid: number,
      qn?: number,
      options?: { preferMp4?: boolean },
    ) => Promise<VideoPlayInfo>;
    fetchMediaRange: (
      url: string,
      range: string | undefined,
      referer: string,
    ) => Promise<Uint8Array>;
    getVideoRelation: (bvid: string, aid: number) => Promise<VideoRelation>;
    likeVideo: (aid: number, like: boolean) => Promise<void>;
    addCoin: (payload: AddCoinPayload) => Promise<void>;
    shareVideo: (aid: number, bvid: string) => Promise<boolean>;
    reportWatchHeartbeat: (payload: WatchHeartbeatPayload) => Promise<void>;
    getDanmakuList: (cid: number) => Promise<DanmakuItem[]>;
    sendDanmaku: (payload: SendDanmakuPayload) => Promise<void>;
    getComments: (
      aid: number,
      page?: number,
      sort?: 0 | 1 | 2,
      offset?: string,
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
    ) => Promise<CommentItem | null>;
    likeComment: (aid: number, rpid: number, like: boolean) => Promise<void>;
    hateComment: (
      oid: string,
      type: number,
      rpid: number | string,
      hate: boolean,
    ) => Promise<void>;
    deleteComment: (
      oid: string,
      type: number,
      rpid: number | string,
    ) => Promise<void>;
    reportComment: (
      oid: string,
      type: number,
      rpid: number | string,
      reason: number,
    ) => Promise<void>;
    getReplyEmotes: () => Promise<ReplyEmotePanel>;
    getFavFolders: () => Promise<FavFolder[]>;
    createFavFolder: (payload: CreateFavFolderPayload) => Promise<FavFolder>;
    getFavFolderInfo: (mediaId: number) => Promise<FavFolder>;
    editFavFolder: (payload: EditFavFolderPayload) => Promise<FavFolder>;
    deleteFavFolder: (mediaId: number) => Promise<void>;
    sortFavFolders: (mediaIds: number[]) => Promise<void>;
    getVideoFavFolders: (aid: number) => Promise<VideoFavFolder[]>;
    suggestFavFolder: (
      payload: SuggestFavFolderPayload,
    ) => Promise<SuggestFavFolderResult | null>;
    setVideoFavFolders: (
      aid: number,
      addMediaIds: number[],
      delMediaIds: number[],
    ) => Promise<void>;
    getFavResources: (
      mediaId: number,
      page?: number,
      riskRetry?: "short" | "long",
    ) => Promise<FavResourcesPage>;
    removeFavResources: (mediaId: number, aids: number[]) => Promise<void>;
    moveFavResources: (
      srcMediaId: number,
      tarMediaId: number,
      aids: number[],
    ) => Promise<void>;
    cleanFavResources: (mediaId: number) => Promise<CleanFavResourcesResult>;
    getFollowings: (page?: number) => Promise<FollowingUp[]>;
    getFollowTags: () => Promise<FollowTag[]>;
    createFollowTag: (name: string) => Promise<FollowTag>;
    getFollowingsInTag: (
      tagId: number,
      page?: number,
    ) => Promise<FollowingsPage>;
    getUserRelationList: (
      mid: number,
      type: UserRelationListType,
      page?: number,
    ) => Promise<UserRelationListPage>;
    getUserFollowTags: (mid: number) => Promise<number[]>;
    setUserFollowTags: (mid: number, tagIds: number[]) => Promise<void>;
    getUpProfile: (mid: number) => Promise<UpProfile>;
    getUpRelation: (mid: number) => Promise<UpRelation>;
    modifyFollow: (mid: number, follow: boolean) => Promise<void>;
    modifySpecialFollow: (mid: number, special: boolean) => Promise<void>;
    getBlacklist: (page?: number) => Promise<BlacklistPage>;
    modifyBlock: (mid: number, block: boolean) => Promise<void>;
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
    searchUsers: (
      keyword: string,
      page?: number,
      order?: SearchUserOrder,
      userType?: SearchUserTypeFilter,
    ) => Promise<SearchUsersPage>;
    searchArticles: (
      keyword: string,
      page?: number,
      order?: SearchArticleOrder,
    ) => Promise<SearchArticlesPage>;
    searchMedia: (
      keyword: string,
      kind: SearchMediaKind,
      page?: number,
    ) => Promise<SearchMediaPage>;
    searchLiveRooms: (
      keyword: string,
      page?: number,
      order?: SearchLiveOrder,
    ) => Promise<SearchLivePage>;
    getSearchSuggest: (term: string) => Promise<SearchSuggestItem[]>;
    getSearchTypeCounts: (keyword: string) => Promise<SearchTypeCounts>;
    getToViewList: () => Promise<ToViewList>;
    addToView: (
      aid: number,
      bvid: string,
      video?: VideoItem,
      forceLocal?: boolean,
    ) => Promise<ToViewAddResult>;
    removeFromToView: (aid: number) => Promise<void>;
    getLocalToViewList: () => Promise<ToViewList>;
    removeFromLocalToView: (bvid: string) => Promise<void>;
    removeManyFromLocalToView: (bvids: string[]) => Promise<void>;
    getSpaceDynamics: (
      mid: number,
      offset?: string,
    ) => Promise<SpaceDynamicPage>;
    getSpaceOpus: (mid: number, offset?: string) => Promise<SpaceOpusPage>;
    getFollowDynamics: (
      offset?: string,
      type?: DynamicFeedType,
    ) => Promise<SpaceDynamicPage>;
    getDynamicDetail: (id: string) => Promise<SpaceDynamicItem>;
    likeDynamic: (id: string, like: boolean) => Promise<void>;
    getArticle: (id: number) => Promise<ArticleDetail>;
    likeArticle: (id: number, like: boolean) => Promise<void>;
    getTargetComments: (
      oid: string,
      type: number,
      page?: number,
      sort?: 0 | 1 | 2,
      offset?: string,
    ) => Promise<CommentPage>;
    getTargetCommentReplies: (
      oid: string,
      type: number,
      root: number,
      page?: number,
    ) => Promise<CommentPage>;
    addTargetComment: (
      oid: string,
      type: number,
      message: string,
      root?: number,
      parent?: number,
    ) => Promise<CommentItem | null>;
    likeTargetComment: (
      oid: string,
      type: number,
      rpid: number,
      like: boolean,
    ) => Promise<void>;
    getWatchHistory: (
      type?: HistoryFeedType,
      cursor?: HistoryCursor,
      filters?: HistoryFilters,
    ) => Promise<HistoryPage>;
    deleteWatchHistory: (item: {
      business: string;
      oid: number;
      kid?: number;
    }) => Promise<void>;
    clearWatchHistory: () => Promise<void>;
    getHistoryShadow: () => Promise<boolean>;
    setHistoryShadow: (record: boolean) => Promise<void>;
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
    getUgcSeasonSubscribed: (seasonId: number) => Promise<boolean>;
    setUgcSeasonSubscribe: (
      seasonId: number,
      subscribe: boolean,
    ) => Promise<boolean>;
    getFavVideoMedias: (page?: number) => Promise<FavMediasPage>;
    getOpusFavorites: (page?: number) => Promise<OpusFavPage>;
    getCheeseFollowList: (
      page?: number,
      mid?: number,
    ) => Promise<CheeseCoursePage>;
    getUpowerPaidList: () => Promise<ChargeRecordResult>;
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
    organizeBiliFavorites: (
      overrides?: Record<string, string>,
    ) => Promise<{ taskId: number }>;
    mergeDumpFavIntoDefault: () => Promise<{ taskId: number }>;
    mergeDuplicateTopicFolders: () => Promise<{ taskId: number }>;
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
    /** 开启/关闭系统 Acrylic，透出桌面壁纸磨砂 */
    setWindowGlass: (enabled: boolean) => Promise<boolean>;
    setFullscreen: (on: boolean) => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    onFullscreenChange: (callback: (on: boolean) => void) => () => void;
    onNavigate: (callback: (path: string) => void) => () => void;
    openExternal: (url: string) => Promise<void>;
    resolveBiliUrl: (url: string) => Promise<string>;
    probeShortcut: (
      accelerator: string,
    ) => Promise<{ taken: boolean; reason?: string }>;
  };
}

declare global {
  interface Window {
    biliDesk: BiliDeskApi;
  }
}

export {};
