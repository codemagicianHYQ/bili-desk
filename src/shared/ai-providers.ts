/** OpenAI 兼容接口的主流平台预设（设置页 + 主进程共用） */

export type AiProviderId =
  | "deepseek"
  | "openai"
  | "qwen"
  | "zhipu"
  | "moonshot"
  | "doubao"
  | "siliconflow"
  | "ollama"
  | "custom";

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

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "性价比高，适合分组与长文本",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    docsUrl: "https://platform.deepseek.com/api_keys",
    placeholderKey: "sk-...",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "官方 GPT，需可访问 api.openai.com",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
    docsUrl: "https://platform.openai.com/api-keys",
    placeholderKey: "sk-...",
  },
  {
    id: "qwen",
    label: "通义千问",
    description: "阿里云 DashScope 兼容模式",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
    docsUrl: "https://bailian.console.aliyun.com/",
    placeholderKey: "sk-...",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    description: "智谱开放平台 OpenAI 兼容接口",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash", "glm-4-air", "glm-4-plus", "glm-4.5-flash"],
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    placeholderKey: "...",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    description: "月之暗面，长上下文表现好",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      "kimi-latest",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    placeholderKey: "sk-...",
  },
  {
    id: "doubao",
    label: "豆包 / 火山方舟",
    description: "模型名填接入点 ID（如 ep-xxxx）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["ep-xxxx"],
    docsUrl: "https://console.volcengine.com/ark",
    placeholderKey: "...",
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    description: "聚合多家开源模型，按量计费",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      "deepseek-ai/DeepSeek-V3",
      "Qwen/Qwen2.5-7B-Instruct",
      "THUDM/glm-4-9b-chat",
    ],
    docsUrl: "https://cloud.siliconflow.cn/account/ak",
    placeholderKey: "sk-...",
  },
  {
    id: "ollama",
    label: "Ollama（本地）",
    description: "本机 Ollama，无需 Key",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: ["llama3.2", "qwen2.5", "deepseek-r1"],
    docsUrl: "https://ollama.com/",
    local: true,
    placeholderKey: "可留空",
  },
  {
    id: "custom",
    label: "自定义",
    description: "任意 OpenAI 兼容网关 / 中转",
    baseUrl: "",
    models: [],
    placeholderKey: "sk-...",
  },
];

export function getAiProviderPreset(
  id: AiProviderId | string | undefined,
): AiProviderPreset {
  return (
    AI_PROVIDER_PRESETS.find((item) => item.id === id) ??
    AI_PROVIDER_PRESETS.find((item) => item.id === "custom")!
  );
}

/** 根据已保存的 baseUrl 反推平台（旧配置无 provider 时用） */
export function inferAiProviderId(baseUrl: string): AiProviderId {
  const url = baseUrl.trim().toLowerCase();
  if (!url) return "custom";
  if (url.includes("deepseek.com")) return "deepseek";
  if (url.includes("api.openai.com")) return "openai";
  if (url.includes("dashscope.aliyuncs.com")) return "qwen";
  if (url.includes("bigmodel.cn")) return "zhipu";
  if (url.includes("moonshot.cn")) return "moonshot";
  if (url.includes("volces.com") || url.includes("volcengine")) return "doubao";
  if (url.includes("siliconflow")) return "siliconflow";
  if (url.includes("11434") || url.includes("ollama")) return "ollama";
  return "custom";
}
