import type {
  CollectionClassifyMode,
  CollectionClassifyProgress,
  CollectionClassifyResult,
  CollectionGroup,
  CollectionGroupMap,
  CollectionListKind,
  UserCollectionItem,
} from "@shared/types";
import { collectionGroupKey } from "@shared/utils/collection-groups";
import { appStore } from "../store/app-store";
import { aiService } from "./ai-service";
import { biliApi } from "./bili-api";
import { matchTitleToCategory } from "./fav-classifier";

const MAX_PAGES = 30;
const PAGE_DELAY_MS = 300;
const AI_BATCH_SIZE = 40;

/** 给 AI 的参考目录：一级尽量从这里选，二级可按内容补充 */
const SUGGESTED_TREE: Array<[string, string[]]> = [
  [
    "计算机",
    [
      "前端",
      "后端",
      "算法",
      "数据库",
      "运维",
      "网络安全",
      "操作系统",
      "计算机基础",
      "编程语言",
      "移动开发",
      "嵌入式",
      "游戏开发",
      "工具效率",
    ],
  ],
  ["AI", ["大模型", "Agent", "AI视频", "AI绘画", "AI工具", "机器学习"]],
  ["学习", ["考研", "英语", "数学", "职场", "读书"]],
  ["科技", ["数码", "硬件", "科普"]],
  ["娱乐", ["游戏", "影视", "音乐", "动画", "搞笑"]],
  ["生活", ["美食", "运动健身", "旅行", "财经", "人文历史"]],
];

const AI_L3_RENAME: Record<string, string> = { LLM: "大模型" };

type ProgressFn = (progress: CollectionClassifyProgress) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selfMid(): number {
  return (
    appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID)
  );
}

function hasAiConfigured(): boolean {
  const config = aiService.getConfig();
  return (
    Boolean(config.apiKey) ||
    /11434|localhost|127\.0\.0\.1/i.test(config.baseUrl ?? "")
  );
}

export async function fetchAllCollections(
  listKind: CollectionListKind,
): Promise<UserCollectionItem[]> {
  const mid = selfMid();
  if (!mid) return [];
  const items: UserCollectionItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const result =
      listKind === "subscribed"
        ? await biliApi.getSubscribedCollections(page)
        : await biliApi.getUserCollections(mid, page);
    for (const item of [...result.seasons, ...result.series]) {
      const key = collectionGroupKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...item, source: item.source ?? listKind });
    }
    if (!result.hasMore) break;
  }
  return items;
}

/** 本地分类的范围：我收藏的 + 我创建的 */
export async function fetchLocalCollections(): Promise<UserCollectionItem[]> {
  const subscribed = await fetchAllCollections("subscribed");
  const created = await fetchAllCollections("created");
  const seen = new Set(subscribed.map(collectionGroupKey));
  return [
    ...subscribed,
    ...created.filter((item) => !seen.has(collectionGroupKey(item))),
  ];
}

export function getCollectionGroups(): CollectionGroupMap {
  return appStore.get("collectionGroups") ?? {};
}

function cleanName(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\s/\\|>]+/g, "")
    .slice(0, max);
}

export function setCollectionGroup(
  key: string,
  group: { l1: string; l2: string } | null,
): CollectionGroupMap {
  const groups = { ...getCollectionGroups() };
  const l1 = cleanName(group?.l1, 8);
  if (!group || !l1) {
    delete groups[key];
  } else {
    groups[key] = {
      l1,
      l2: cleanName(group.l2, 10) || "综合",
      source: "manual",
    };
  }
  appStore.set("collectionGroups", groups);
  return groups;
}

export function renameCollectionGroup(
  l1: string,
  l2: string | null,
  name: string,
): CollectionGroupMap {
  const next = cleanName(name, l2 == null ? 8 : 10);
  const groups = { ...getCollectionGroups() };
  if (!next) return groups;
  for (const [key, group] of Object.entries(groups)) {
    if (group.l1 !== l1) continue;
    if (l2 == null) groups[key] = { ...group, l1: next };
    else if (group.l2 === l2) groups[key] = { ...group, l2: next };
  }
  appStore.set("collectionGroups", groups);
  return groups;
}

function ruleGroup(text: string): CollectionGroup | null {
  const matched = matchTitleToCategory(text);
  if (!matched) return null;
  if (matched.l1 === "计算机" && matched.l2 === "人工智能") {
    const l3 = matched.l3 ?? "";
    return { l1: "AI", l2: AI_L3_RENAME[l3] ?? (l3 || "综合"), source: "rule" };
  }
  return { l1: matched.l1, l2: matched.l2 ?? matched.l3 ?? "", source: "rule" };
}

function classifyByName(item: UserCollectionItem): CollectionGroup | null {
  const group = ruleGroup(`${item.title} ${item.description}`.slice(0, 200));
  return group?.l2 ? group : null;
}

/** 合集内视频标题逐条过规则后投票 */
function classifyByVideoTitles(titles: string[]): CollectionGroup | null {
  const exact = new Map<string, { group: CollectionGroup; count: number }>();
  const byL1 = new Map<string, number>();
  for (const title of titles) {
    const group = ruleGroup(title);
    if (!group) continue;
    byL1.set(group.l1, (byL1.get(group.l1) ?? 0) + 1);
    if (!group.l2) continue;
    const key = `${group.l1}/${group.l2}`;
    const entry = exact.get(key);
    if (entry) entry.count++;
    else exact.set(key, { group, count: 1 });
  }
  const best = [...exact.values()].sort((a, b) => b.count - a.count)[0];
  const minVotes = titles.length <= 3 ? 1 : 2;
  if (best && best.count >= minVotes) return best.group;
  const bestL1 = [...byL1].sort((a, b) => b[1] - a[1])[0];
  if (bestL1 && bestL1[1] >= minVotes) {
    return { l1: bestL1[0], l2: "综合", source: "rule" };
  }
  return null;
}

const ZONE_RULES: Array<[RegExp, string, string?]> = [
  [/人工智能|\bAI\b|AIGC/i, "AI"],
  [/计算机|软件|编程|程序|网络技术|开发/, "计算机"],
  [/数码|手机|电脑|装机|科工|极客|汽车|摄影/, "科技"],
  [
    /科学|科普|社科|人文|历史|财经|商业|校园|学习|职业|职场|设计|技能|知识|演讲|公开课/,
    "学习",
  ],
  [/游戏|电竞|单机|网游|手游|桌游|音游|GMV|Mugen/i, "娱乐", "游戏"],
  [/音乐|翻唱|演奏|VOCALOID|MV|乐评|说唱|乐器/i, "娱乐", "音乐"],
  [/影视|电影|电视剧|纪录|综艺|剧集|影评/, "娱乐", "影视"],
  [/动画|番剧|国创|动漫|MAD|手书|鬼畜|搞笑|明星|舞蹈|宅舞/i, "娱乐"],
  [
    /美食|运动|健身|篮球|足球|体育|旅|出行|生活|日常|家居|手工|绘画|宠物|动物|时尚|美妆|穿搭|情感|亲子|三农|户外|骑行|健康|医疗/,
    "生活",
  ],
];

function classifyByZone(zone: string): CollectionGroup | null {
  if (!zone) return null;
  for (const [pattern, l1, l2] of ZONE_RULES) {
    if (pattern.test(zone)) return { l1, l2: l2 ?? zone, source: "rule" };
  }
  return { l1: "其他", l2: zone, source: "rule" };
}

interface CollectionSample {
  titles: string[];
  firstBvid: string;
}

async function sampleCollection(
  item: UserCollectionItem,
): Promise<CollectionSample> {
  const page =
    item.kind === "season"
      ? await biliApi.getSeasonArchives(item.ownerMid ?? selfMid(), item.id, 1)
      : await biliApi.getSeriesArchives(item.id, 1);
  return {
    titles: page.videos.map((video) => video.title).filter(Boolean),
    firstBvid: page.videos[0]?.bvid ?? "",
  };
}

async function classifyBatchByAi(
  batch: UserCollectionItem[],
  knownGroups: CollectionGroup[],
  samples: Map<string, CollectionSample>,
): Promise<Map<string, CollectionGroup>> {
  const known = Array.from(
    new Set(knownGroups.map((group) => `${group.l1}/${group.l2}`)),
  ).slice(0, 80);
  const system = [
    "你是 B 站视频合集整理助手，把每个合集归入「一级/二级」两层分类。",
    "参考目录（一级尽量从这里选，二级可按内容补充，一级总数不超过 10 个）：",
    ...SUGGESTED_TREE.map(([l1, l2s]) => `- ${l1}：${l2s.join("、")}`),
    known.length > 0 ? `已经在用的分类请优先复用：${known.join("、")}` : "",
    "规则：编程 / 开发 / 计算机课程归「计算机」并细分方向；大模型、AI 应用、AI 生成内容归「AI」，AI 生成或讲 AI 视频制作的归「AI/AI视频」。",
    "合集名不明确时以「视频示例」的标题为准。每个合集都必须给出分类，不许留空。",
    "二级分类 2~6 个字，要具体，不要用「其他」「综合」除非实在无法判断。",
    '只返回 JSON 数组，不要其它文字：[{"i":序号,"l1":"一级","l2":"二级"}]',
  ]
    .filter(Boolean)
    .join("\n");
  const user = batch
    .map((item, index) => {
      const desc = item.description
        ? ` —— ${item.description.replace(/\s+/g, " ").slice(0, 60)}`
        : "";
      const titles = samples.get(collectionGroupKey(item))?.titles ?? [];
      const sample =
        titles.length > 0
          ? `\n   视频示例：${titles
              .slice(0, 8)
              .map((title) => title.slice(0, 40))
              .join(" | ")}`
          : "";
      return `${index}. ${item.title}${desc}${sample}`;
    })
    .join("\n");

  const response = await aiService.chat(system, user);
  const jsonText = response.match(/\[[\s\S]*\]/)?.[0];
  const result = new Map<string, CollectionGroup>();
  if (!jsonText) return result;
  const parsed = JSON.parse(jsonText) as Array<{
    i?: unknown;
    l1?: unknown;
    l2?: unknown;
  }>;
  for (const row of parsed) {
    const item = batch[Number(row.i)];
    const l1 = cleanName(row.l1, 8);
    const l2 = cleanName(row.l2, 10);
    if (!item || !l1) continue;
    result.set(collectionGroupKey(item), {
      l1,
      l2: l2 || "综合",
      source: "ai",
    });
  }
  return result;
}

export async function classifyCollections(
  mode: CollectionClassifyMode,
  onProgress: ProgressFn,
): Promise<CollectionClassifyResult> {
  const report = (done: number, total: number, message: string) =>
    onProgress({ done, total, message });

  report(0, 0, "正在拉取全部合集…");
  const items = await fetchLocalCollections();
  const groups = { ...getCollectionGroups() };

  const targets = items.filter((item) => {
    const current = groups[collectionGroupKey(item)];
    if (!current) return true;
    return mode === "all" && current.source !== "manual";
  });
  if (targets.length === 0) {
    const message =
      items.length === 0 ? "没有可整理的合集" : "所有合集都已分类";
    report(items.length, items.length, message);
    return { items, groups, message };
  }
  for (const item of targets) delete groups[collectionGroupKey(item)];

  const total = targets.length;
  let done = 0;
  const assign = (item: UserCollectionItem, group: CollectionGroup) => {
    groups[collectionGroupKey(item)] = group;
    done++;
  };

  let nameCount = 0;
  let pending: UserCollectionItem[] = [];
  for (const item of targets) {
    const group = classifyByName(item);
    if (group) {
      assign(item, group);
      nameCount++;
    } else pending.push(item);
  }
  report(done, total, `按名称归类 ${nameCount} 个，开始抓取合集内视频…`);

  const samples = new Map<string, CollectionSample>();
  let videoCount = 0;
  const afterVideo: UserCollectionItem[] = [];
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index];
    report(
      done,
      total,
      `看合集内视频标题 ${index + 1}/${pending.length}：${item.title}`,
    );
    if (index > 0) await sleep(PAGE_DELAY_MS);
    try {
      const sample = await sampleCollection(item);
      samples.set(collectionGroupKey(item), sample);
      const group = classifyByVideoTitles(sample.titles);
      if (group) {
        assign(item, group);
        videoCount++;
        continue;
      }
    } catch {
      // 抓不到视频时交给后面的 AI / 分区兜底
    }
    afterVideo.push(item);
  }
  pending = afterVideo;
  appStore.set("collectionGroups", groups);

  let aiCount = 0;
  let aiError = "";
  const useAi = hasAiConfigured();
  if (useAi && pending.length > 0) {
    const leftover: UserCollectionItem[] = [];
    for (let start = 0; start < pending.length; start += AI_BATCH_SIZE) {
      const batch = pending.slice(start, start + AI_BATCH_SIZE);
      report(
        done,
        total,
        `AI 正在整理 ${start + 1}–${start + batch.length} / ${pending.length}`,
      );
      try {
        const matched = await classifyBatchByAi(
          batch,
          Object.values(groups),
          samples,
        );
        for (const item of batch) {
          const group = matched.get(collectionGroupKey(item));
          if (group) {
            assign(item, group);
            aiCount++;
          } else leftover.push(item);
        }
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
        leftover.push(...pending.slice(start));
        break;
      }
      appStore.set("collectionGroups", groups);
    }
    pending = leftover;
  }

  let zoneCount = 0;
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index];
    const bvid = samples.get(collectionGroupKey(item))?.firstBvid;
    if (!bvid) continue;
    report(
      done,
      total,
      `按 B 站分区兜底 ${index + 1}/${pending.length}：${item.title}`,
    );
    if (index > 0) await sleep(PAGE_DELAY_MS);
    try {
      const group = classifyByZone(await biliApi.getVideoZoneName(bvid));
      if (group) {
        assign(item, group);
        zoneCount++;
      }
    } catch {
      // ignore
    }
  }
  appStore.set("collectionGroups", groups);

  const ungrouped = total - done;
  const parts = [`名称 ${nameCount}`, `视频标题 ${videoCount}`];
  if (useAi) parts.push(`AI ${aiCount}`);
  parts.push(`分区 ${zoneCount}`);
  if (ungrouped > 0) parts.push(`未分组 ${ungrouped}`);
  let message = `已整理 ${total} 个合集（${parts.join("，")}）`;
  if (aiError) message += `；AI 调用失败：${aiError}`;
  else if (!useAi) message += "；配置 AI 后二级分类会更细";
  report(total, total, message);
  return { items, groups, message };
}
