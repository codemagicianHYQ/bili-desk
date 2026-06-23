import { useEffect, useState } from 'react'
import type { AiConfig } from '@shared/types'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export function SettingsPage() {
  const { theme, setTheme } = useAppStore()
  const [ai, setAi] = useState<AiConfig>({ baseUrl: '', apiKey: '', model: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.biliDesk.ai.getConfig().then(setAi)
  }, [])

  const saveAi = async () => {
    await window.biliDesk.ai.setConfig(ai)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-medium">外观</h3>
        <div className="flex gap-2">
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            onClick={() => void setTheme('light')}
          >
            浅色
          </Button>
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            onClick={() => void setTheme('dark')}
          >
            深色
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-medium">AI 配置</h3>
        <p className="text-sm text-muted-foreground">
          支持 OpenAI 兼容 API（DeepSeek、OpenAI、Ollama 等），用于 UP 主智能分组。
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">API Base URL</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.baseUrl}
            onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">API Key</span>
          <input
            type="password"
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.apiKey}
            onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">模型</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.model}
            onChange={(e) => setAi({ ...ai, model: e.target.value })}
            placeholder="deepseek-chat"
          />
        </label>
        <Button onClick={() => void saveAi()}>{saved ? '已保存' : '保存 AI 配置'}</Button>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h3 className="font-medium text-foreground">关于 BiliDesk</h3>
        <p>版本 0.1.0 — B 站 Windows 第三方客户端原型</p>
        <p>核心差异化：收藏夹二级分类 · 关注 UP AI/规则分组 · 简洁 UI</p>
      </section>
    </div>
  )
}
