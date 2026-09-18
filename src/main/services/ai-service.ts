import axios from "axios";
import { appStore } from "../store/app-store";
import { getAiProviderPreset, inferAiProviderId } from "@shared/ai-providers";
import type { AiConfig } from "@shared/types";

export class AiService {
  getConfig(): AiConfig {
    const raw = appStore.get("ai");
    const provider = raw.provider ?? inferAiProviderId(raw.baseUrl);
    return { ...raw, provider };
  }

  setConfig(config: Partial<AiConfig>): AiConfig {
    const current = this.getConfig();
    const next: AiConfig = {
      ...current,
      ...config,
      provider:
        config.provider ??
        current.provider ??
        inferAiProviderId(config.baseUrl ?? current.baseUrl),
    };
    appStore.set("ai", next);
    return next;
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const config = this.getConfig();
    const preset = getAiProviderPreset(config.provider);
    const baseUrl = (config.baseUrl || preset.baseUrl).replace(/\/$/, "");
    if (!baseUrl) {
      throw new Error("请先在设置页填写 API Base URL");
    }

    const isLocal =
      Boolean(preset.local) || /11434|localhost|127\.0\.0\.1/i.test(baseUrl);
    if (!config.apiKey && !isLocal) {
      throw new Error("请先在设置页配置 AI API Key");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const res = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: config.model || preset.models[0] || "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      },
      {
        headers,
        timeout: 60000,
      },
    );

    return res.data?.choices?.[0]?.message?.content ?? "";
  }

  /** 轻量连通测试：发一句极短对话 */
  async testConnection(): Promise<
    { ok: true; reply: string } | { ok: false; message: string }
  > {
    try {
      const reply = await this.chat(
        "你是连通性测试助手。只回复两个字：成功",
        "ping",
      );
      const text = String(reply || "").trim();
      if (!text) {
        return { ok: false, message: "接口有响应，但返回内容为空" };
      }
      return { ok: true, reply: text.slice(0, 80) };
    } catch (err) {
      const ax = err as {
        response?: {
          status?: number;
          data?: { error?: { message?: string }; message?: string };
        };
        message?: string;
      };
      const apiMsg =
        ax.response?.data?.error?.message ||
        ax.response?.data?.message ||
        ax.message ||
        "请求失败";
      const status = ax.response?.status;
      return {
        ok: false,
        message: status ? `[${status}] ${apiMsg}` : String(apiMsg),
      };
    }
  }
}

export const aiService = new AiService();
