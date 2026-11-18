/** 与官网当前混入表一致。改这里时桌面端和手机端一起生效。 */
export declare const MIXIN_KEY_ENC_TAB: number[];
export declare function extractWbiKey(url: string): string;
export declare function signWbiParams(params: Record<string, string | number>, imgKey: string, subKey: string): Record<string, string | number>;
