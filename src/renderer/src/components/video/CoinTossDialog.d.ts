interface CoinTossDialogProps {
    open: boolean;
    remainingCoins: number;
    liked: boolean;
    selectLike: boolean;
    loading?: boolean;
    error?: string;
    onSelectLikeChange: (value: boolean) => void;
    onConfirm: (multiply: 1 | 2) => void;
    onClose: () => void;
}
/** 投币弹窗：双卡片选币 + 选中动效（参考官方交互，原创小电视形象） */
export declare function CoinTossDialog({ open, remainingCoins, liked, selectLike, loading, error, onSelectLikeChange, onConfirm, onClose, }: CoinTossDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
