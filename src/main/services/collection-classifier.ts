import type {
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
const PREFERRED_L1 = ["计算机", "学习", "娱乐", "生活"];

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

export function getCollectionGroups(): CollectionGroupMap {
  return appStore.get("collectionGroups") ?? {};
}

function classifyByRule(item: UserCollectionItem): CollectionGroup | null {
  const matched = matchTitleToCategory(
    `${item.title} ${item.description}`.slice(0, 200),
  );
  if (!matched) return null;
  const l2 = matched.l2 ?? matched.l3;
  if (!l2) return null;
  return { l1: matched.l1, l2, source: "rule" };
}

function cleanName(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\s/\\|>]+/g, "")
    .slice(0, max);
}

async function classifyBatchByAi(
  batch: UserCollectionItem[],
  knownGroups: CollectionGroup[],
): Promise<Map<number, CollectionGroup>> {
  const known = Array.from(
    new Set(knownGroups.map((group) => `${group.l1}/${group.l2}`)),
  ).slice(0, 60);
  const system = [
    "你是 B 站视频合集整理助手，把每个合集归入「一级/二级」两层分类。",
    `一级分类优先用：${PREFERRED_L1.join("、")}；实在不合适才新建，一级总数尽量不超过 8 个。`,
    known.length > 0 ? `已有分类请尽量复用：${known.join("、")}` : "",
    "二级分类要具体（如 前端、考研数学、单机游戏、健身），2~6 个字。",
    '只返回 JSON 数组，不要其它文字：[{"i":序号,"l1":"一级","l2":"二级"}]',
  ]
    .filter(Boolean)
    .join("\n");
  const user = batch
    .map(
      (item, index) =>
        `${index}. ${item.title}${item.description ? ` —— ${item.description.replace(/\s+/g, " ").slice(0, 80)}` : ""}`,
    )
    .join("\n");

  const response = await aiService.chat(system, user);
  const jsonText = response.match(/\[[\s\S]*\]/)?.[0];
  const result = new Map<number, CollectionGroup>();
  if (!jsonText) return result;
  const parsed = JSON.parse(jsonText) as Array<{
    i?: unknown;
    l1?: unknown;
    l2?: unknown;
  }>;
  for (const row of parsed) {
    const index = Number(row.i);
    const item = batch[index];
    const l1 = cleanName(row.l1, 8);
    const l2 = cleanName(row.l2, 10);
    if (!item || !l1) continue;
    result.set(item.id, { l1, l2: l2 || "综合", source: "ai" });
  }
  return result;
}

export async function classifyCollections(
  listKind: CollectionListKind,
  onProgress: ProgressFn,
): Promise<CollectionClassifyResult> {
  const report = (done: number, total: number, message: string) =>
    onProgress({ listKind, done, total, message });

  report(0, 0, "正在拉取全部合集…");
  const items = await fetchAllCollections(listKind);
  const stored = { ...getCollectionGroups() };
  for (const item of items) delete stored[collectionGroupKey(item)];

  if (items.length === 0) {
    appStore.set("collectionGroups", stored);
    return { items, groups: stored, message: "没有可整理的合集" };
  }

  const groups: CollectionGroupMap = {};
  const pending: UserCollectionItem[] = [];
  for (const item of items) {
    const rule = classifyByRule(item);
    if (rule) groups[collectionGroupKey(item)] = rule;
    else pending.push(item);
  }
  const ruleCount = items.length - pending.length;
  report(ruleCount, items.length, `规则已归类 ${ruleCount} 个`);

  let aiCount = 0;
  let aiError = "";
  const useAi = hasAiConfigured();
  if (useAi && pending.length > 0) {
    for (let start = 0; start < pending.length; start += AI_BATCH_SIZE) {
      const batch = pending.slice(start, start + AI_BATCH_SIZE);
      report(
        ruleCount + start,
        items.length,
        `AI 正在整理 ${start + 1}–${start + batch.length} / ${pending.length}`,
      );
      try {
        const matched = await classifyBatchByAi(batch, Object.values(groups));
        for (const item of batch) {
          const group = matched.get(item.id);
          if (!group) continue;
          groups[collectionGroupKey(item)] = group;
          aiCount++;
        }
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
        break;
      }
    }
  }

  const merged = { ...stored, ...groups };
  appStore.set("collectionGroups", merged);

  const ungrouped = items.length - ruleCount - aiCount;
  const parts = [`规则 ${ruleCount}`];
  if (useAi) parts.push(`AI ${aiCount}`);
  parts.push(`未分组 ${ungrouped}`);
  let message = `已整理 ${items.length} 个合集（${parts.join("，")}）`;
  if (aiError) message += `；AI 调用失败：${aiError}`;
  else if (!useAi && ungrouped > 0) {
    message += "；在设置页配置 AI 后可自动归类剩余合集";
  }
  report(items.length, items.length, message);
  return { items, groups: merged, message };
}
