import { type ReactNode } from "react";
/** known 有值时不再请求。列表没标时按 bvid 查稿件详情 */
export declare function useCoverChargeBadge(bvid?: string, known?: string): string;
export declare function ChargeCoverBadge({ label, className, }: {
    label?: string;
    className?: string;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function ChargeMarkedCover({ bvid, known, className, badgeClassName, children, }: {
    bvid?: string;
    known?: string;
    className?: string;
    badgeClassName?: string;
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
