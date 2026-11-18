export type CelebrateKind = "like" | "coin" | "triple";
interface ActionCelebrateProps {
    kind: CelebrateKind;
    open: boolean;
    onDone: () => void;
}
/** 点赞 / 投币成功时的小电视弹出动画（参考官方互动反馈，非官方素材复刻） */
export declare function ActionCelebrate({ kind, open, onDone }: ActionCelebrateProps): import("react/jsx-runtime").JSX.Element;
export {};
