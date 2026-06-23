export interface VideoItem {
  bvid: string
  aid: number
  title: string
  cover: string
  duration: number
  play: number
  danmaku: number
  owner: {
    mid: number
    name: string
    face: string
  }
  pubdate: number
}

export interface VideoDetail extends VideoItem {
  desc: string
  pages: VideoPagePart[]
  stat: {
    view: number
    danmaku: number
    reply: number
    favorite: number
    coin: number
    like: number
  }
}

export interface VideoPagePart {
  cid: number
  page: number
  part: string
  duration: number
}

export interface VideoPlayInfo {
  url: string
  format: 'mp4' | 'flv'
  quality: number
  qualityLabel: string
  qualities: Array<{ qn: number; label: string }>
}

export interface UserInfo {
  mid: number
  name: string
  face: string
  isLogin: boolean
}

export interface QrLoginResult {
  url: string
  qrcodeKey: string
}

export interface AuthPollResult {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed'
  user?: UserInfo
  message?: string
}

export interface FavFolder {
  id: number
  fid: number
  title: string
  mediaCount: number
  cover: string
}

export interface FavResource {
  id: number
  bvid: string
  title: string
  cover: string
  upper: { mid: number; name: string }
  duration: number
}

export interface FavResourcesPage {
  resources: FavResource[]
  page: number
  hasMore: boolean
}

export interface FollowingUp {
  mid: number
  uname: string
  face: string
  sign: string
  official: { role: number; title: string }
  /** 是否特别关注 */
  special?: boolean
  /** 是否互相关注 */
  mutual?: boolean
}

export interface FollowTag {
  tagId: number
  name: string
  count: number
}

export interface FollowingsPage {
  followings: FollowingUp[]
  page: number
  hasMore: boolean
}

export interface UpProfile {
  mid: number
  name: string
  face: string
  sign: string
  fans: number
  following: number
  videos: number
}

export interface UpRelation {
  isFollowing: boolean
  attribute: number
}

export interface UpVideosPage {
  videos: VideoItem[]
  page: number
  hasMore: boolean
  total: number
}

export interface RecommendPage {
  videos: VideoItem[]
  freshIdx: number
  hasMore: boolean
}

export interface CategoryL1 {
  id: number
  name: string
  icon: string
  sortOrder: number
}

export interface CategoryL2 {
  id: number
  categoryL1Id: number
  name: string
  sortOrder: number
}

export interface CategoryL3 {
  id: number
  categoryL2Id: number
  name: string
  sortOrder: number
}

export interface CategoryTreeL3Node {
  id: number
  name: string
  sortOrder: number
  count?: number
}

export interface CategoryTreeL2Node {
  id: number
  name: string
  sortOrder: number
  count?: number
  children: CategoryTreeL3Node[]
}

export interface CategoryTreeNode {
  id: number
  name: string
  icon: string
  sortOrder: number
  count?: number
  children: CategoryTreeL2Node[]
}

export interface FavoriteItemAssignment {
  id: number
  mediaId: number
  avid: number
  bvid: string
  title: string
  cover?: string
  upperName?: string
  duration?: number
  categoryL1Id: number | null
  categoryL2Id: number | null
  categoryL3Id: number | null
}

export type LocalCategoryLevel = 'all' | 'l1' | 'l2' | 'l3' | 'uncategorized'

export interface LocalCategorySelection {
  level: LocalCategoryLevel
  id: number | null
}

export interface UpGroup {
  id: number
  name: string
  color: string
  isAiGenerated: boolean
  sortOrder: number
  memberCount: number
}

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface ClassificationTask {
  id: number
  type: string
  status: 'pending' | 'running' | 'done' | 'failed'
  progress: number
  message: string
}

export type Theme = 'light' | 'dark'

export interface BiliDeskApi {
  auth: {
    getQrCode: () => Promise<QrLoginResult>
    pollLogin: (qrcodeKey: string) => Promise<AuthPollResult>
    logout: () => Promise<void>
    getStatus: () => Promise<UserInfo>
  }
  bili: {
    getRecommend: (options?: { freshIdx?: number; freshIdx1h?: number; ps?: number }) => Promise<RecommendPage>
    getVideo: (bvid: string) => Promise<VideoDetail>
    getPlayUrl: (bvid: string, cid: number, qn?: number) => Promise<VideoPlayInfo>
    getFavFolders: () => Promise<FavFolder[]>
    getFavResources: (mediaId: number, page?: number) => Promise<FavResourcesPage>
    getFollowings: (page?: number) => Promise<FollowingUp[]>
    getFollowTags: () => Promise<FollowTag[]>
    getFollowingsInTag: (tagId: number, page?: number) => Promise<FollowingsPage>
    getUserFollowTags: (mid: number) => Promise<number[]>
    setUserFollowTags: (mid: number, tagIds: number[]) => Promise<void>
    getUpProfile: (mid: number) => Promise<UpProfile>
    getUpRelation: (mid: number) => Promise<UpRelation>
    modifyFollow: (mid: number, follow: boolean) => Promise<void>
    getUpVideos: (mid: number, page?: number) => Promise<UpVideosPage>
  }
  taxonomy: {
    getTree: () => Promise<CategoryTreeNode[]>
    createL1: (name: string, icon?: string) => Promise<CategoryL1>
    createL2: (categoryL1Id: number, name: string) => Promise<CategoryL2>
    createL3: (categoryL2Id: number, name: string) => Promise<CategoryL3>
    updateCategoryName: (level: 'l1' | 'l2' | 'l3', id: number, name: string) => Promise<void>
    getFavoriteAssignments: () => Promise<FavoriteItemAssignment[]>
    classifyAllFavorites: () => Promise<{ taskId: number }>
    classifyFolderFavorites: (mediaId: number) => Promise<{ taskId: number }>
    getFavTaskStatus: (taskId: number) => Promise<ClassificationTask | null>
    enrichFavoriteCovers: () => Promise<{ updated: number; remaining: number }>
    getUpGroups: () => Promise<UpGroup[]>
    createUpGroup: (name: string, color?: string) => Promise<UpGroup>
    getUpGroupMemberMids: (groupId: number) => Promise<number[]>
  }
  ai: {
    getConfig: () => Promise<AiConfig>
    setConfig: (config: Partial<AiConfig>) => Promise<AiConfig>
    runUpClassification: () => Promise<{ taskId: number }>
    getTaskStatus: (taskId: number) => Promise<ClassificationTask | null>
  }
  app: {
    getTheme: () => Promise<Theme>
    setTheme: (theme: Theme) => Promise<Theme>
  }
}

declare global {
  interface Window {
    biliDesk: BiliDeskApi
  }
}

export {}
