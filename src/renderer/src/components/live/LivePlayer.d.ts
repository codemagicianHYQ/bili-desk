import type { LivePlayInfo } from "@shared/types";
interface LivePlayerProps {
    playInfo: LivePlayInfo;
    poster?: string;
    className?: string;
    onQualityChange: (qn: number) => void;
    onError?: (message: string) => void;
    /** 首连 NetworkError 重试耗尽后，请父组件换新流地址 */
    onRequestReload?: () => void;
}
export declare function LivePlayer({ playInfo, poster, className, onQualityChange, onError, onRequestReload, }: LivePlayerProps): import("react/jsx-runtime").JSX.Element;
export {};
