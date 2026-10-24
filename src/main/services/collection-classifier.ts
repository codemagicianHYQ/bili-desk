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
import {
  type Evidence,
  isConfident,
  scoreEvidence,
  suggestedTreeText,
} from "./collection-taxonomy";

const MAX_PAGES = 30;
const PAGE_DELAY_MS = 300;
const SAMPLE_DELAY_MS = 600;
const BACKOFF_MS = 4000;
const TAG_SAMPLE_VIDEOS = 3;
const SAMPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AI_BATCH_SIZE = 40;
/** 只看名称 + 标题就足够确定时，不再抓标签 */
const CONFIDENT_SCORE = 12;
/** 加上标签后仍达不到就交给 AI / 留在未分组 */
const MIN_SCORE = 6;

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

interface CollectionSample {
  titles: string[];
  bvids: string[];
  tags?: string[];
  at: number;
}

type SampleCache = Record<string, CollectionSample>;

async function fetchSample(
  item: UserCollectionItem,
): Promise<CollectionSample> {
  const page =
    item.kind === "season"
      ? await biliApi.getFavSeasonArchives(item.id, 1, 20)
      : await biliApi.getSeriesArchives(item.id, 1);
  return {
    titles: page.videos.map((video) => video.title).filter(Boolean),
    bvids: page.videos.map((video) => video.bvid).filter(Boolean),
    at: Date.now(),
  };
}

async function fetchTags(bvids: string[]): Promise<string[]> {
  const tags = new Set<string>();
  for (const bvid of bvids.slice(0, TAG_SAMPLE_VIDEOS)) {
    await sleep(SAMPLE_DELAY_MS);
    try {
      for (const tag of await biliApi.getVideoTagNames(bvid)) tags.add(tag);
    } catch {
      await sleep(BACKOFF_MS);
    }
  }
  return [...tags];
}

function buildEvidence(
  item: UserCollectionItem,
  sample: CollectionSample | undefined,
): Evidence[] {
  const evidence: Evidence[] = [
    { text: item.title, weight: 3 },
    { text: item.description, weight: 2 },
  ];
  for (const title of sample?.titles ?? []) {
    evidence.push({ text: title, weight: 1 });
  }
  for (const tag of sample?.tags ?? []) {
    evidence.push({ text: tag, weight: 1 });
  }
  return evidence;
}

function toGroup(match: { l1: string; l2: string }): CollectionGroup {
  return { l1: match.l1, l2: match.l2, source: "rule" };
}

async function classifyBatchByAi(
  batch: UserCollectionItem[],
  knownGroups: CollectionGroup[],
  samples: SampleCache,
): Promise<Map<string, CollectionGroup>> {
  const known = Array.from(
    new Set(knownGroups.map((group) => `${group.l1}/${group.l2}`)),
  ).slice(0, 80);
  const system = [
    "你是 B 站视频合集整理助手，把每个合集归入「一级/二级」两层分类。",
    "参考目录（一级尽量从这里选，二级可按内容补充，一级总数不超过 10 个）：",
    ...suggestedTreeText(),
    known.length > 0 ? `已经在用的分类请优先复用：${known.join("、")}` : "",
    "规则：编程 / 开发 / 计算机课程归「计算机」并细分方向；大模型、AI 应用、AI 生成内容归「AI」；摄影、剪辑、设计、绘画等动手技能归「技能」。",
    "合集名不明确时以「视频示例」和「标签」为准。每个合集都必须给出分类，不许留空。",
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
      const sample = samples[collectionGroupKey(item)];
      const titles = sample?.titles ?? [];
      const titleText =
        titles.length > 0
          ? `\n   视频示例：${titles
              .slice(0, 8)
              .map((title) => title.slice(0, 40))
              .join(" | ")}`
          : "";
      const tagText =
        sample?.tags && sample.tags.length > 0
          ? `\n   标签：${sample.tags.slice(0, 12).join("、")}`
          : "";
      return `${index}. ${item.title}${desc}${titleText}${tagText}`;
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

  const samples: SampleCache = { ...appStore.get("collectionSamples") };
  const now = Date.now();
  const saveSamples = () => appStore.set("collectionSamples", samples);

  const total = targets.length;
  let done = 0;
  let ruleCount = 0;
  let tagCount = 0;
  let fetchFailed = 0;
  let failStreak = 0;
  const pending: UserCollectionItem[] = [];

  for (let index = 0; index < targets.length; index++) {
    const item = targets[index];
    const key = collectionGroupKey(item);
    report(done, total, `分析 ${index + 1}/${total}：${item.title}`);

    let sample = samples[key];
    if (!sample || now - sample.at > SAMPLE_TTL_MS) {
      await sleep(SAMPLE_DELAY_MS);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          sample = await fetchSample(item);
          samples[key] = sample;
          failStreak = 0;
          break;
        } catch {
          if (attempt === 1) {
            report(done, total, "B 站限流了，歇一会儿再继续…");
            await sleep(BACKOFF_MS * Math.min(failStreak + 1, 4));
          }
        }
      }
      if (!samples[key]) {
        fetchFailed++;
        failStreak++;
      }
    }

    let match = scoreEvidence(buildEvidence(item, sample));
    if (!isConfident(match, CONFIDENT_SCORE) && sample && sample.bvids.length) {
      if (!sample.tags) {
        report(done, total, `看视频标签 ${index + 1}/${total}：${item.title}`);
        sample.tags = await fetchTags(sample.bvids);
      }
      match = scoreEvidence(buildEvidence(item, sample));
      if (isConfident(match, MIN_SCORE)) tagCount++;
    }

    if (match && isConfident(match, MIN_SCORE)) {
      groups[key] = toGroup(match);
      ruleCount++;
      done++;
    } else pending.push(item);

    if (index % 20 === 19) {
      saveSamples();
      appStore.set("collectionGroups", groups);
    }
  }
  saveSamples();
  appStore.set("collectionGroups", groups);

  let aiCount = 0;
  let aiError = "";
  const useAi = hasAiConfigured();
  let leftover = pending;
  if (useAi && pending.length > 0) {
    leftover = [];
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
            groups[collectionGroupKey(item)] = group;
            aiCount++;
            done++;
          } else leftover.push(item);
        }
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
        leftover.push(...pending.slice(start));
        break;
      }
      appStore.set("collectionGroups", groups);
    }
  }

  // 没 AI 时：有一点倾向就先归过去，比堆在未分组强；完全没线索的才留下
  let weakCount = 0;
  for (const item of leftover) {
    const match = scoreEvidence(
      buildEvidence(item, samples[collectionGroupKey(item)]),
    );
    if (match && match.score >= 3 && match.score > match.runnerUp) {
      groups[collectionGroupKey(item)] = toGroup(match);
      weakCount++;
      done++;
    }
  }
  appStore.set("collectionGroups", groups);

  const ungrouped = total - done;
  const parts = [`规则 ${ruleCount}（其中靠视频标签 ${tagCount}）`];
  if (useAi) parts.push(`AI ${aiCount}`);
  if (weakCount > 0) parts.push(`低把握 ${weakCount}`);
  if (ungrouped > 0) parts.push(`未分组 ${ungrouped}`);
  let message = `已整理 ${total} 个合集：${parts.join("，")}`;
  if (fetchFailed > 0) {
    message += `；${fetchFailed} 个合集的视频没抓到（B 站限流），过几分钟点「整理新增」会补上`;
  }
  if (aiError) message += `；AI 调用失败：${aiError}`;
  else if (!useAi && weakCount > 0) {
    message += "；低把握的建议配置 AI 后再「全部重整」";
  }
  report(total, total, message);
  return { items, groups, message };
}
