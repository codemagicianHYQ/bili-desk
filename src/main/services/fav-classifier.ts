import { taxonomyRepo } from '../db/repositories/taxonomy'
import type { FavResource } from '@shared/types'

interface CategoryMatch {
  categoryL1Id: number | null
  categoryL2Id: number | null
  categoryL3Id: number | null
}

/** 标题关键词 -> 三级分类路径（按优先级从上到下匹配，越具体越靠前） */
const TITLE_RULES: Array<{
  l1: string
  l2?: string
  l3?: string
  keywords: RegExp
}> = [
  // 计算机 · 前端
  { l1: '计算机', l2: '前端', l3: 'Vue', keywords: /\bvue\b|vue3|nuxt|pinia|vite/i },
  { l1: '计算机', l2: '前端', l3: 'React', keywords: /\breact\b|next\.?js|redux|jsx/i },
  { l1: '计算机', l2: '前端', l3: 'TypeScript', keywords: /typescript|\btsx\b/i },
  { l1: '计算机', l2: '前端', keywords: /前端|javascript|\bjs\b|css|html|webpack|tailwind|前端开发|uniapp|小程序/i },
  // 计算机 · 后端
  { l1: '计算机', l2: '后端', l3: 'Node.js', keywords: /node\.?js|express|koa|nestjs|deno/i },
  { l1: '计算机', l2: '后端', l3: 'Java', keywords: /\bjava\b|spring|mybatis|jvm|maven|gradle/i },
  { l1: '计算机', l2: '后端', l3: 'Go', keywords: /\bgolang\b|\bgo语言\b|gin框架/i },
  { l1: '计算机', l2: '后端', l3: 'Python', keywords: /\bpython\b|django|flask|fastapi|pandas|numpy/i },
  { l1: '计算机', l2: '后端', l3: 'C/C++', keywords: /\bc\+\+\b|\bcpp\b|\bc语言\b|cmake|qt\b/i },
  { l1: '计算机', l2: '后端', l3: 'Rust', keywords: /\brust\b|tokio|actix/i },
  { l1: '计算机', l2: '后端', keywords: /后端|server|api开发|微服务|中间件|rpc/i },
  // 计算机 · 网络 / AI / 数据 / 运维
  { l1: '计算机', l2: '计算机网络', keywords: /计算机网络|tcp|udp|http协议|网络协议|dns|路由|socket|抓包/i },
  { l1: '计算机', l2: '人工智能', l3: 'Agent', keywords: /agent|智能体|copilot|langchain|mcp|autogpt/i },
  { l1: '计算机', l2: '人工智能', l3: 'LLM', keywords: /llm|gpt|claude|deepseek|大模型|chatgpt|prompt|通义|文心/i },
  {
    l1: '计算机',
    l2: '人工智能',
    keywords: /人工智能|(?<![a-z])ai(?![a-z])|机器学习|深度学习|神经网络|transformer|扩散模型|cv\b|nlp\b|计算机视觉/i
  },
  { l1: '计算机', l2: '数据库', keywords: /mysql|redis|mongodb|postgres|sql|数据库|elasticsearch|clickhouse|sqlite/i },
  { l1: '计算机', l2: '运维', keywords: /docker|kubernetes|k8s|linux|devops|运维|nginx|ci\/cd|jenkins|terraform/i },
  { l1: '计算机', l2: '算法', keywords: /算法|数据结构|leetcode|力扣|竞赛|acm|动态规划|图论/i },
  {
    l1: '计算机',
    keywords: /编程|代码|计算机|软件工程|程序员|开发教程|github|开源|ide\b|vscode|cursor\b/i
  },
  // 学习
  { l1: '学习', l2: '外语', l3: '英语', keywords: /英语|雅思|托福|gre|口语|听力|背单词|四六级|cet/i },
  { l1: '学习', l2: '外语', l3: '日语', keywords: /日语|jlpt|n1|n2|n3|五十音/i },
  { l1: '学习', l2: '外语', keywords: /外语|韩语|法语|德语|西班牙语/i },
  { l1: '学习', l2: '数学', keywords: /数学|微积分|线性代数|概率论|高等数学|考研数学/i },
  { l1: '学习', l2: '考研', keywords: /考研|408|政治|肖秀荣|张宇|汤家凤/i },
  { l1: '学习', l2: '面试', keywords: /面试|八股|求职|简历|校招|社招|offer/i },
  { l1: '学习', l2: '课程', keywords: /教程|课程|公开课|网课|教学|入门|零基础|实战|学习笔记/i },
  // 娱乐
  { l1: '娱乐', l2: '游戏', keywords: /游戏|steam|原神|王者|电竞|mc\b|minecraft|塞尔达|黑神话/i },
  { l1: '娱乐', l2: '影视', keywords: /电影|电视剧|影评|解说|追剧|番剧|动漫|动画|二次元/i },
  { l1: '娱乐', l2: '音乐', keywords: /音乐|歌曲|钢琴|吉他|演奏|翻唱|乐理/i },
  // 生活
  { l1: '生活', l2: '美食', keywords: /美食|做饭|烹饪|菜谱|探店|吃播|烘焙/i },
  { l1: '生活', l2: '旅游', keywords: /旅游|旅行|vlog|自驾|攻略|景点|酒店/i },
  { l1: '生活', l2: '健身', keywords: /健身|减肥|瑜伽|跑步|增肌|训练计划/i },
  { l1: '生活', l2: '数码', keywords: /手机|数码|电脑装机|显卡|cpu|评测|开箱|耳机/i },
  { l1: '生活', l2: '财经', keywords: /财经|股票|基金|理财|投资|经济|房价|货币/i },
  { l1: '生活', l2: '科普', keywords: /科普|知识|讲解|纪录片|历史|物理|化学|生物|天文/i },
  { l1: '生活', keywords: /生活|日常|分享|记录|感悟|情感|心理|健康/i }
]

function buildAssignment(item: FavResource, match: CategoryMatch) {
  return {
    mediaId: item.id,
    avid: item.id,
    bvid: item.bvid,
    title: item.title,
    cover: item.cover,
    upperName: item.upper.name,
    duration: item.duration,
    ...match
  }
}

const BATCH_SIZE = 100

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export function classifyFavoriteTitle(title: string): CategoryMatch {
  const writer = taxonomyRepo.createClassificationWriter()
  return classifyFavoriteTitleWithWriter(writer, title)
}

function classifyFavoriteTitleWithWriter(
  writer: ReturnType<typeof taxonomyRepo.createClassificationWriter>,
  title: string
): CategoryMatch {
  const text = title.toLowerCase()

  for (const rule of TITLE_RULES) {
    if (!rule.keywords.test(text) && !rule.keywords.test(title)) continue

    const l1 = writer.findOrCreateL1(rule.l1)

    let l2Id: number | null = null
    let l3Id: number | null = null

    if (rule.l2) {
      const l2 = writer.findOrCreateL2(l1.id, rule.l2)
      l2Id = l2.id
      if (rule.l3) {
        const l3 = writer.findOrCreateL3(l2.id, rule.l3)
        l3Id = l3.id
        l2Id = l3.categoryL2Id
      }
    }

    return { categoryL1Id: l1.id, categoryL2Id: l2Id, categoryL3Id: l3Id }
  }

  const other = writer.findOrCreateL1('其他')
  return {
    categoryL1Id: other.id,
    categoryL2Id: null,
    categoryL3Id: null
  }
}

export async function classifyFavoriteItemsAsync(
  items: FavResource[],
  onProgress?: (done: number, total: number) => void,
  options?: { resetCategories?: boolean }
): Promise<number> {
  taxonomyRepo.ensureExtendedFavTaxonomy()
  if (options?.resetCategories !== false) {
    taxonomyRepo.resetFavCategoriesForClassify()
  } else {
    taxonomyRepo.repairTaxonomy()
  }

  const writer = taxonomyRepo.createClassificationWriter()
  const assignments: ReturnType<typeof buildAssignment>[] = []

  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const match = classifyFavoriteTitleWithWriter(writer, item.title)
    assignments.push(buildAssignment(item, match))

    const done = index + 1
    if (done % BATCH_SIZE === 0 || done === items.length) {
      onProgress?.(done, items.length)
      await yieldToEventLoop()
    }
  }

  writer.commitAssignments(assignments)
  return assignments.length
}

export function classifyFavoriteItems(items: FavResource[]): number {
  const writer = taxonomyRepo.createClassificationWriter()
  const assignments = items.map((item) => buildAssignment(item, classifyFavoriteTitleWithWriter(writer, item.title)))
  writer.commitAssignments(assignments)
  return assignments.length
}
