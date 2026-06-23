import { aiService } from './ai-service'
import { biliApi } from './bili-api'
import { taxonomyRepo } from '../db/repositories/taxonomy'
import { classifyUpFromVideoTitles, classifyUpProfile, type UpCategoryMatch } from './up-classifier'

const VIDEO_FETCH_DELAY_MS = 350

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ClassifyEngine {
  async runUpClassification(taskId: number): Promise<void> {
    const writer = taxonomyRepo.createUpClassificationWriter()
    const pendingAssignments: Array<{
      mid: number
      groupId: number
      source: string
      confidence: number
    }> = []

    try {
      taxonomyRepo.updateTask(taskId, { status: 'running', progress: 5, message: '获取关注列表...' })

      const followings = await biliApi.getAllFollowings()
      const leafGroups = taxonomyRepo.getUpLeafGroups()

      if (followings.length === 0) {
        taxonomyRepo.updateTask(taskId, {
          status: 'done',
          progress: 100,
          message: '暂无关注 UP，请先登录并同步关注列表'
        })
        return
      }

      const hasAi = Boolean(aiService.getConfig().apiKey)
      const groupList = leafGroups.map((group) => `- ${group.path} (id:${group.id})`).join('\n')
      let profileMatched = 0
      let videoMatched = 0
      let aiMatched = 0
      let skipped = 0

      for (let index = 0; index < followings.length; index++) {
        const up = followings[index]
        taxonomyRepo.updateTask(taskId, {
          progress: Math.round(10 + ((index + 1) / followings.length) * 85),
          message: `正在分类: ${up.uname}`
        })

        let match = classifyUpProfile(up)
        let source = 'rule-profile'

        if (!match) {
          try {
            if (index > 0) await sleep(VIDEO_FETCH_DELAY_MS)
            taxonomyRepo.updateTask(taskId, {
              message: `抓取视频标题: ${up.uname}`
            })
            const titles = await biliApi.getRecentVideoTitles(up.mid, 5)
            match = classifyUpFromVideoTitles(titles)
            if (match) {
              source = 'rule-video'
            }
          } catch {
            // 抓取失败时跳过视频规则
          }
        }

        const matchedByRule = match ? this.resolveGroupId(match, writer) : null
        if (matchedByRule) {
          pendingAssignments.push({
            mid: up.mid,
            groupId: matchedByRule,
            source,
            confidence: 100
          })
          if (source === 'rule-video') videoMatched++
          else profileMatched++
          if ((index + 1) % 20 === 0) await yieldToEventLoop()
          continue
        }

        if (!hasAi) {
          skipped++
          if ((index + 1) % 20 === 0) await yieldToEventLoop()
          continue
        }

        try {
          const prompt = `UP昵称: ${up.uname}\n签名: ${up.sign}\n认证: ${up.official.title}`
          const response = await aiService.chat(
            `你是 B 站 UP 主分类助手。请从下列二级分组中选择最合适的一项:\n${groupList}\n只返回 JSON: {"groupId":number,"confidence":number,"reason":string}`,
            prompt
          )
          const jsonMatch = response.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as {
              groupId: number
              confidence: number
              reason: string
            }
            if (leafGroups.some((group) => group.id === result.groupId)) {
              pendingAssignments.push({
                mid: up.mid,
                groupId: result.groupId,
                source: 'ai',
                confidence: result.confidence
              })
              aiMatched++
            } else {
              skipped++
            }
          } else {
            skipped++
          }
        } catch {
          skipped++
        }

        if ((index + 1) % 5 === 0) await yieldToEventLoop()
      }

      taxonomyRepo.replaceAllUpMembers(pendingAssignments)

      const ruleMatched = profileMatched + videoMatched
      const message = hasAi
        ? `已完成 ${followings.length} 位 UP 的分类（资料 ${profileMatched}，视频 ${videoMatched}，AI ${aiMatched}，未匹配 ${skipped}）`
        : ruleMatched > 0
          ? `规则分类完成：${ruleMatched} 位已分组（资料 ${profileMatched}，视频 ${videoMatched}），${skipped} 位暂未匹配（可在设置页配置 API Key 后使用 AI 分类）`
          : `规则未匹配到分组，${skipped} 位仍在「未分组」（可在设置页配置 API Key 后使用 AI 分类）`

      taxonomyRepo.updateTask(taskId, {
        status: 'done',
        progress: 100,
        message
      })
    } catch (error) {
      taxonomyRepo.updateTask(taskId, {
        status: 'failed',
        progress: 100,
        message: error instanceof Error ? error.message : '分类任务失败'
      })
    }
  }

  private resolveGroupId(
    match: UpCategoryMatch,
    writer: ReturnType<typeof taxonomyRepo.createUpClassificationWriter>
  ): number {
    const l1 = writer.findOrCreateL1(match.l1)
    const l2 = writer.findOrCreateL2(l1.id, match.l2 ?? '综合')
    return l2.id
  }

  startUpClassification(): number {
    const task = taxonomyRepo.createTask('up_classification')
    void this.runUpClassification(task.id)
    return task.id
  }
}

export const classifyEngine = new ClassifyEngine()
