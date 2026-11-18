import type { AiConfig } from "@shared/types";
export declare class AiService {
    getConfig(): AiConfig;
    setConfig(config: Partial<AiConfig>): AiConfig;
    chat(systemPrompt: string, userPrompt: string): Promise<string>;
    /** 轻量连通测试：发一句极短对话 */
    testConnection(): Promise<{
        ok: true;
        reply: string;
    } | {
        ok: false;
        message: string;
    }>;
}
export declare const aiService: AiService;
