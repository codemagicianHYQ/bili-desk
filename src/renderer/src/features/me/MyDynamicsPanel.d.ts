import type { UpProfile } from "@shared/types";
interface MyDynamicsPanelProps {
    mid: number;
    profile: Pick<UpProfile, "name" | "face"> | null;
}
export declare function MyDynamicsPanel({ mid, profile }: MyDynamicsPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
