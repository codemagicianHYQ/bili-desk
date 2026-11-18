import type { RecommendDislikeReason, VideoItem } from "@shared/types";
interface VideoCardProps {
    video: VideoItem;
    className?: string;
    /** owner: UP 主 + 播放量；stats: 发布时间 + 播放量（用于自己的投稿） */
    meta?: "owner" | "stats";
    /** 在 UP 主名旁显示「已关注」标签 */
    showFollowedBadge?: boolean;
    /** 禁用跳转（编辑多选等场景） */
    interactive?: boolean;
    /** 隐藏稍后再看快捷按钮 */
    hideWatchLater?: boolean;
    /** 0–100，贴在封面底部，和历史记录页一致 */
    progressPercent?: number;
    /** 封面左下角进度文案，例如「看到 0:14」 */
    progressLabel?: string;
    onCardClick?: () => void;
    /** 首页推荐：右下角「不感兴趣」菜单 */
    onDislike?: (reason: RecommendDislikeReason) => void;
}
export declare function VideoCard({ video, className, meta, showFollowedBadge, interactive, hideWatchLater, progressPercent, progressLabel, onCardClick, onDislike, }: VideoCardProps): import("react/jsx-runtime").JSX.Element;
export {};
