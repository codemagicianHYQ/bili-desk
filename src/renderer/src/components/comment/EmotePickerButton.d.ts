interface EmotePickerProps {
    onPick: (emoteText: string, imageUrl?: string) => void;
    className?: string;
    /** dialog 是评论区弹层；popover 贴在按钮上方，底部是表情包分类 */
    variant?: "dialog" | "popover";
}
export declare function EmotePickerButton({ onPick, className, variant, }: EmotePickerProps): import("react/jsx-runtime").JSX.Element;
export {};
