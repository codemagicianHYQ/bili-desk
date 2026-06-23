import axios from 'axios'
import { appStore } from '../store/app-store'
import type { AiConfig } from '@shared/types'

export class AiService {
  getConfig(): AiConfig {
    return appStore.get('ai')
  }

  setConfig(config: Partial<AiConfig>): AiConfig {
    const next = { ...appStore.get('ai'), ...config }
    appStore.set('ai', next)
    return next
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const config = this.getConfig()
    if (!config.apiKey) {
      throw new Error('请先在设置页配置 AI API Key')
    }

    const res = await axios.post(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    )

    return res.data?.choices?.[0]?.message?.content ?? ''
  }
}

export const aiService = new AiService()
