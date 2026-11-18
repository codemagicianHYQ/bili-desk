export declare const SHORTCUT_STORAGE_KEY = "bilidesk-shortcuts";
export declare const SHORTCUTS_CHANGED_EVENT = "bilidesk-shortcuts-changed";
export declare const SEEK_STEP_OPTIONS: readonly [3, 5, 10, 15, 30];
export type ShortcutAction = "seekBackward" | "seekForward" | "playPause" | "volumeUp" | "volumeDown" | "mute" | "fullscreen" | "goBack" | "goForward";
export interface ShortcutConfig {
    seekStep: number;
    keys: Record<ShortcutAction, string>;
}
export declare const DEFAULT_SHORTCUTS: ShortcutConfig;
export declare const SHORTCUT_LABELS: Record<ShortcutAction, string>;
export declare function setShortcutCapturing(on: boolean): void;
export declare function isShortcutCapturing(): boolean;
export declare function eventToChord(event: KeyboardEvent): string | null;
export declare function formatChord(chord: string): string;
export declare function chordToAccelerator(chord: string): string;
export declare function needsGlobalProbe(chord: string): boolean;
export declare function isReservedChord(chord: string): string | null;
export declare function findInternalConflict(config: ShortcutConfig, action: ShortcutAction, chord: string): ShortcutAction | null;
export declare function readShortcutConfig(): ShortcutConfig;
export declare function writeShortcutConfig(config: ShortcutConfig): void;
export declare function isTypingTarget(target: EventTarget | null): boolean;
/** 图片灯箱、确认框等弹层打开时，播放器快捷键应让路 */
export declare function isModalOpen(): boolean;
