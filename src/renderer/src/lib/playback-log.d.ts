export type PlaybackLogContext = Record<string, string | number | boolean | null | undefined>;
export declare function describeMediaError(video?: HTMLVideoElement | null): string;
export declare function describeDashError(event: unknown): string;
export declare function logPlayback(event: string, context: PlaybackLogContext, extra?: unknown): void;
