import { type LiveDanmuStats } from "@/lib/live-danmu-socket";
interface LiveChatPanelProps {
    roomId: number;
    viewers?: number;
    active?: boolean;
    onStats?: (stats: LiveDanmuStats) => void;
    className?: string;
}
export declare function LiveChatPanel({ roomId, viewers, active, onStats, className, }: LiveChatPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
