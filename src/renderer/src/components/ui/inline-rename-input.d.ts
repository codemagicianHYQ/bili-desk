/** 行内重命名：Enter 提交、Esc 取消、失焦提交；返回 null 表示不改 */
export declare function InlineRenameInput({ initial, maxLength, onDone, }: {
    initial: string;
    maxLength: number;
    onDone: (value: string | null) => void;
}): import("react/jsx-runtime").JSX.Element;
