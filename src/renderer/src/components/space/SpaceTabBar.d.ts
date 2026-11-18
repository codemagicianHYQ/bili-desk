import type { ComponentType } from "react";
export interface SpaceTab<T extends string> {
    id: T;
    label: string;
    /** 页签旁的数量，超过 999 显示 999+ */
    count?: number;
    icon?: ComponentType<{
        className?: string;
    }>;
}
export declare function SpaceTabBar<T extends string>({ tabs, value, onChange, className, }: {
    tabs: Array<SpaceTab<T>>;
    value: T;
    onChange: (id: T) => void;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
