type ChallengeListener = (state: "open" | "waiting" | "done" | "fail", detail?: string) => void;
export declare function setAicuChromeListener(cb: ChallengeListener | null): void;
export declare function resetAicuChromeGate(): void;
export declare function fetchAicuViaChrome(url: string): Promise<{
    status: number;
    text: string;
    via: string;
    detail?: string;
}>;
export declare function closeAicuChrome(): Promise<void>;
export {};
