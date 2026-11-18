import type { DynamicLotteryCard, DynamicVoteCard, SpaceDynamicItem } from "@shared/types";
export declare function DynamicVoteCardView({ vote, mode, }: {
    vote: DynamicVoteCard;
    mode: "compact" | "detail";
}): import("react/jsx-runtime").JSX.Element;
export declare function DynamicLotteryCardView({ lottery, }: {
    lottery: DynamicLotteryCard;
}): import("react/jsx-runtime").JSX.Element;
export declare function DynamicAttachCards({ item, voteMode, }: {
    item: SpaceDynamicItem;
    voteMode: "compact" | "detail";
}): import("react/jsx-runtime").JSX.Element | null;
