import type { PopularVideoItem } from "@shared/types";
interface PopularVideoCardProps {
    video: PopularVideoItem;
    showRank?: boolean;
}
export declare function PopularVideoCard({ video, showRank }: PopularVideoCardProps): import("react/jsx-runtime").JSX.Element;
export {};
