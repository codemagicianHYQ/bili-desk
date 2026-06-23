import { matchTitleToCategory } from './fav-classifier'

export interface UpCategoryMatch {
  l1: string
  l2?: string
}

/** UP 昵称/签名/认证 -> 一级/二级本地分组（按优先级从上到下匹配） */
const UP_PROFILE_RULES: Array<UpCategoryMatch & { keywords: RegExp }> = [
  { l1: '计算机', l2: '前端', keywords: /前端开发|up主.*前端/i },
  { l1: '计算机', l2: '嵌入式', keywords: /嵌入式|单片机|stm32|arduino|fpga|rtos|物联网|mcu/i },
  { l1: '计算机', l2: '硬核科技', keywords: /硬核科技|硬核|芯片|半导体|光刻|处理器|硬件/i },
  { l1: '学习', l2: '考研', keywords: /计算机考研|考研/i },
  { l1: '生活', l2: '财经', keywords: /股票投资|财经|基金/i },
  { l1: '生活', l2: '历史人文', keywords: /历史人文|历史|人文|哲学|考古/i },
  { l1: '生活', l2: '自行车', keywords: /自行车|骑行|公路车|山地车/i },
  { l1: '生活', l2: '运动着装', keywords: /运动着装|穿搭|服饰|时尚|ootd/i }
]

function matchRules(text: string, rules: Array<UpCategoryMatch & { keywords: RegExp }>): UpCategoryMatch | null {
  for (const rule of rules) {
    if (rule.keywords.test(text) || rule.keywords.test(text.toLowerCase())) {
      return { l1: rule.l1, l2: rule.l2 }
    }
  }
  return null
}

export function classifyUpText(text: string): UpCategoryMatch | null {
  return matchRules(text, UP_PROFILE_RULES) ?? matchTitleToUpCategory(text)
}

function matchTitleToUpCategory(text: string): UpCategoryMatch | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const candidates = lines.length > 0 ? lines : [text]

  for (const line of candidates) {
    const matched = matchTitleToCategory(line)
    if (!matched) continue
    return {
      l1: matched.l1,
      l2: matched.l2 ?? matched.l3
    }
  }

  return null
}

export function classifyUpProfile(up: {
  uname: string
  sign: string
  official?: { title: string }
}): UpCategoryMatch | null {
  const text = `${up.uname} ${up.sign} ${up.official?.title ?? ''}`
  return classifyUpText(text)
}

export function classifyUpFromVideoTitles(titles: string[]): UpCategoryMatch | null {
  if (titles.length === 0) return null
  return classifyUpText(titles.join('\n'))
}
