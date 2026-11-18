export declare function defaultHeaders(): Record<string, string>;
export declare function invalidateWbiCache(): void;
export declare function signParams(params: Record<string, string | number>): Promise<Record<string, string | number>>;
export declare function getCsrf(): string;
