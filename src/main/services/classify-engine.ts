import { aiService } from './ai-service'
import { biliApi } from './bili-api'
import { taxonomyRepo } from '../db/repositories/taxonomy'

export class ClassifyEngine {
  async runUpClassification(taskId: number): Promise<void> {
    try {
      taxonomyRepo.updateTask(taskId, { status: 'running', progress: 5, message: '获取关注列表...' })

      const followings = await biliApi.getFollowings(1)
      const groups = taxonomyRepo.getUpGroups().filter((g) => g.name !== '未分组')

      if (followings.length === 0) {
        taxonomyRepo.updateTask(taskId, {
          status: 'done',
          progress: 100,
          message: '暂无关注 UP，请先登录并同步关注列表'
        })
        return
      }

      const config = aiService.getConfig()
      if (!config.apiKey) {
        taxonomyRepo.updateTask(taskId, {
          status: 'done',
          progress: 100,
          message: 'AI 未配置，已跳过自动分类（可在设置页配置 API Key 后重试）'
        })
        return
      }

      const groupList = groups.map((g) => `- ${g.name} (id:${g.id})`).join('\n')
      let processed = 0

      for (const up of followings.slice(0, 20)) {
        taxonomyRepo.updateTask(taskId, {
          progress: Math.round(10 + (processed / followings.length) * 80),
          message: `正在分类: ${up.uname}`
        })

        const matchedByRule = this.matchByRule(up)
        if (matchedByRule) {
          this.assignUp(up.mid, matchedByRule, 'rule', 100)
          processed++
          continue
        }

        try {
          const prompt = `UP昵称: ${up.uname}\n签名: ${up.sign}\n认证: ${up.official.title}`
          const response = await aiService.chat(
            `你是 B 站 UP 主分类助手。可选分组:\n${groupList}\n只返回 JSON: {"groupId":number,"confidence":number,"reason":string}`,
            prompt
          )
          const jsonMatch = response.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as {
              groupId: number
              confidence: number
              reason: string
            }
            if (groups.some((g) => g.id === result.groupId)) {
              this.assignUp(up.mid, result.groupId, 'ai', result.confidence)
            }
          }
        } catch {
          // skip failed UP
        }

        processed++
      }

      taxonomyRepo.updateTask(taskId, {
        status: 'done',
        progress: 100,
        message: `已完成 ${processed} 位 UP 的分类`
      })
    } catch (error) {
      taxonomyRepo.updateTask(taskId, {
        status: 'failed',
        progress: 100,
        message: error instanceof Error ? error.message : '分类任务失败'
      })
    }
  }

  private matchByRule(up: { uname: string; sign: string }): number | null {
    const name = `${up.uname} ${up.sign}`.toLowerCase()
    if (/游戏|gaming|play/i.test(name)) {
      const group = taxonomyRepo.getUpGroups().find((g) => g.name.includes('生活'))
      return group?.id ?? null
    }
    if (/技术|编程|代码|dev|tech/i.test(name)) {
      const group = taxonomyRepo.getUpGroups().find((g) => g.name.includes('技术'))
      return group?.id ?? null
    }
    return null
  }

  private assignUp(mid: number, groupId: number, source: string, confidence: number): void {
    taxonomyRepo.assignUp(mid, groupId, source, confidence)
  }

  startUpClassification(): number {
    const task = taxonomyRepo.createTask('up_classification')
    void this.runUpClassification(task.id)
    return task.id
  }
}

export const classifyEngine = new ClassifyEngine()
