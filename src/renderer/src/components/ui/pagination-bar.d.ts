import type { ReactNode } from "react";
interface PaginationBarProps {
    page: number;
    totalPages: number;
    disabled?: boolean;
    disableNext?: boolean;
    /**
     * 游标分页等「总页数未知」场景：
     * - 下一页只看 disableNext
     * - 允许跳转到大于当前已知页数的页码（由业务侧按需拉取）
     */
    openEnded?: boolean;
    /** openEnded 时跳转上限，默认 999 */
    maxJumpPage?: number;
    /** pages：官网页码条（1 2 3 … N + 跳至） */
    variant?: "bar" | "pages";
    /** variant=pages 时「共 x 页 / y 个」里的 y */
    totalCount?: number;
    info?: ReactNode;
    onPageChange: (page: number) => void;
    className?: string;
}
export declare function PaginationBar({ page, totalPages, disabled, disableNext, openEnded, maxJumpPage, variant, totalCount, info, onPageChange, className, }: PaginationBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
