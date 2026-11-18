/** OpenAI 兼容接口的主流平台预设（设置页 + 主进程共用） */
export type AiProviderId = "deepseek" | "openai" | "qwen" | "zhipu" | "moonshot" | "doubao" | "siliconflow" | "ollama" | "custom";
export interface AiProviderPreset {
    id: AiProviderId;
    label: string;
    description: string;
    baseUrl: string;
    /** 推荐模型，第一项为默认 */
    models: string[];
    /** 申请 Key / 文档 */
    docsUrl?: string;
    /** 本地部署，Key 可留空 */
    local?: boolean;
    placeholderKey?: string;
}
export declare const AI_PROVIDER_PRESETS: AiProviderPreset[];
export declare function getAiProviderPreset(id: AiProviderId | string | undefined): AiProviderPreset;
/** 根据已保存的 baseUrl 反推平台（旧配置无 provider 时用） */
export declare function inferAiProviderId(baseUrl: string): AiProviderId;
