import { createHash } from "node:crypto";
import type { UpClassifyInfo, UpClassifyMode } from "@shared/types";
import { aiService } from "./ai-service";
import { biliApi } from "./bili-api";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { appStore, type UpClassifyCacheEntry } from "../store/app-store";
import {
  suggestedTreeText,
  taxonomyRulesFingerprint,
  taxonomyTree,
} from "./collection-taxonomy";
import { cleanUpSign, classifyUpEvidence } from "./up-evidence";

const TITLE_FETCH_DELAY_MS = 350;
const TITLE_BACKOFF_MS = 4000;
const TITLE_LIMIT = 15;
const TITLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** 连续这么多次抓标题失败（基本是被限流）就不再抓，剩下的只按资料分 */
const TITLE_MAX_FAIL_STREAK = 15;
/** 只看资料就能确定时不再抓标题 */
const CONFIDENT_SCORE = 12;
/** 分类逻辑（阈值、兜底策略）改了就升这个号，让旧缓存被识别为旧规则 */
const UP_CLASSIFIER_REVISION = "1";
/** 边跑边存，中断最多丢这么多位的结果 */
const CACHE_FLUSH_EVERY = 10;

/** AI 常给的同义名，归回目录里的名字，避免长出「计算机/人工智能」这种重复分支 */
const AI_L1_ALIASES: Record<string, string> = {
  人工智能: "AI",
  ai: "AI",
  编程: "计算机",
  互联网: "计算机",
  财经: "财经商业",
  商业: "财经商业",
  人文: "人文社科",
  历史: "人文社科",
  社会: "人文社科",
  教育: "学习",
  知识: "学习",
  游戏: "娱乐",
  音乐: "娱乐",
  影视: "娱乐",
  美食: "生活",
  数码: "科技",
};

function aiSystemPrompt(tree: string): string {
  return `你是 B 站 UP 主分类助手，把 UP 归入「一级/二级」两层分类。一级和二级都只能从下面目录里原样选，不要自造名字：\n${tree}\n以近期视频标题为主要依据，签名只作参考；实在判断不了就返回 {"l1":"","l2":""}。只返回 JSON: {"l1":"一级","l2":"二级"}`;
}

/** 规则表、AI 提示词、同义名、分类逻辑版本合成的指纹 */
function classifierVersion(): string {
  return createHash("sha1")
    .update(
      JSON.stringify([
        taxonomyRulesFingerprint(),
        aiSystemPrompt(""),
        AI_L1_ALIASES,
        UP_CLASSIFIER_REVISION,
        CONFIDENT_SCORE,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}

/** AI 只能从现有目录里挑；挑不中就返回 null，交给低把握兜底 */
function normalizeAiPick(
  l1Raw: string,
  l2Raw: string,
): { l1: string; l2: string } | null {
  const tree = taxonomyTree();
  const l1Name = l1Raw.trim();
  const l1 =
    tree.find((node) => node.name === l1Name)?.name ??
    AI_L1_ALIASES[l1Name] ??
    AI_L1_ALIASES[l1Name.toLowerCase()];
  const l2Name = l2Raw.trim();
  if (l1) {
    const children = tree.find((node) => node.name === l1)?.children ?? [];
    const l2 =
      children.find((name) => name === l2Name) ??
      children.find(
        (name) => l2Name && (name.includes(l2Name) || l2Name.includes(name)),
      );
    if (l2) return { l1, l2 };
  }
  for (const node of tree) {
    if (node.children.includes(l2Name)) return { l1: node.name, l2: l2Name };
  }
  return null;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasAiConfigured(): boolean {
  const config = aiService.getConfig();
  return (
    Boolean(config.apiKey) ||
    /11434|localhost|127\.0\.0\.1/i.test(config.baseUrl ?? "")
  );
}

type FollowingUp = Awaited<ReturnType<typeof biliApi.getAllFollowings>>[number];

/**
 * 浅层整理能不能直接用这条缓存：
 * 有分类的直接用（规则旧了也用，提示用户去深度整理）；
 * 没线索 / 低把握的，过了标题缓存期或者新配了 AI 才重判。
 */
function reusableInShallow(
  entry: UpClassifyCacheEntry,
  now: number,
  useAi: boolean,
): boolean {
  if (entry.source === "rule" || entry.source === "ai") return true;
  if (useAi && !entry.aiTried) return false;
  return now - entry.at < TITLE_TTL_MS;
}

/** 缓存表是后加的：第一次用时拿现有分组结果补上，标为旧规则，免得浅层整理全部重判 */
function seedCacheFromAssignments(): void {
  const cache = appStore.get("upClassifyCache") ?? {};
  if (Object.keys(cache).length > 0) return;
  const assignments = taxonomyRepo.getUpAssignmentPaths();
  if (assignments.length === 0) return;
  const now = Date.now();
  const seeded: Record<string, UpClassifyCacheEntry> = {};
  for (const item of assignments) {
    const source =
      item.source === "ai" || item.source === "rule-weak"
        ? item.source
        : "rule";
    seeded[String(item.mid)] = {
      l1: item.l1,
      l2: item.l2,
      source,
      confidence: item.confidence,
      at: now,
      version: "legacy",
      aiTried: source === "ai",
    };
  }
  appStore.set("upClassifyCache", seeded);
}

export class ClassifyEngine {
  private runningTaskId: number | null = null;

  getUpClassifyInfo(): UpClassifyInfo {
    seedCacheFromAssignments();
    const version = classifierVersion();
    const entries = Object.values(appStore.get("upClassifyCache") ?? {});
    const deepRun = appStore.get("upClassifyDeepRun");
    return {
      cached: entries.length,
      stale: entries.filter((entry) => entry.version !== version).length,
      deepPending: deepRun != null && deepRun.version === version,
      runningTaskId: this.runningTaskId,
    };
  }

  async runUpClassification(
    taskId: number,
    mode: UpClassifyMode,
  ): Promise<void> {
    const writer = taxonomyRepo.createUpClassificationWriter();
    const assignments: Array<{
      mid: number;
      groupId: number;
      source: string;
      confidence: number;
    }> = [];
    const assign = (
      mid: number,
      l1: string,
      l2: string,
      source: string,
      confidence: number,
    ) => {
      const group = writer.findOrCreateL2(writer.findOrCreateL1(l1).id, l2);
      assignments.push({ mid, groupId: group.id, source, confidence });
    };

    seedCacheFromAssignments();
    const version = classifierVersion();
    const useAi = hasAiConfigured();
    const cache: Record<string, UpClassifyCacheEntry> = {
      ...appStore.get("upClassifyCache"),
    };
    let dirty = 0;
    const flushCache = (force = false) => {
      if (dirty === 0) return;
      if (!force && dirty < CACHE_FLUSH_EVERY) return;
      appStore.set("upClassifyCache", cache);
      dirty = 0;
    };
    const remember = (
      mid: number,
      result: Pick<UpClassifyCacheEntry, "l1" | "l2" | "source" | "confidence">,
    ) => {
      cache[String(mid)] = {
        ...result,
        at: Date.now(),
        version,
        aiTried: useAi,
      };
      dirty++;
      flushCache();
    };

    let resumedDeep = false;
    let deepStartedAt = 0;
    if (mode === "deep") {
      const previous = appStore.get("upClassifyDeepRun");
      if (previous && previous.version === version) {
        resumedDeep = true;
        deepStartedAt = previous.startedAt;
      } else {
        deepStartedAt = Date.now();
        appStore.set("upClassifyDeepRun", {
          startedAt: deepStartedAt,
          version,
        });
      }
    }

    /** 这位 UP 这次能不能直接用缓存 */
    const cachedFor = (mid: number, now: number) => {
      const entry = cache[String(mid)];
      if (!entry) return null;
      if (mode === "shallow") {
        return reusableInShallow(entry, now, useAi) ? entry : null;
      }
      // 深度整理：只复用本轮（中断前）已经按当前规则判断过的
      return entry.version === version && entry.at >= deepStartedAt
        ? entry
        : null;
    };

    try {
      taxonomyRepo.updateTask(taskId, {
        status: "running",
        progress: 5,
        message: resumedDeep
          ? "继续上次没完成的深度整理，获取关注列表..."
          : "获取关注列表...",
      });

      const followings = await biliApi.getAllFollowings();
      if (followings.length === 0) {
        taxonomyRepo.updateTask(taskId, {
          status: "done",
          progress: 100,
          message: "暂无关注 UP，请先登录并同步关注列表",
        });
        return;
      }

      const titleCache = { ...appStore.get("upTitleCache") };
      const latestTitles = new Map(
        (appStore.get("upActivityCache") ?? []).map((record) => [
          record.mid,
          record.latestVideoTitle,
        ]),
      );
      const now = Date.now();
      let failStreak = 0;
      let titlesDisabled = false;
      let titleFetchFailed = 0;
      let ruleCount = 0;
      let titleHelped = 0;
      let reusedCount = 0;
      let reusedStale = 0;
      const pending: Array<{ up: FollowingUp; titles: string[] }> = [];

      for (let index = 0; index < followings.length; index++) {
        const up = followings[index];
        if (index % 10 === 0) {
          taxonomyRepo.updateTask(taskId, {
            progress: Math.round(5 + (index / followings.length) * 75),
            message: `分析 ${index + 1}/${followings.length}：${up.uname}（沿用 ${reusedCount}）`,
          });
          await yieldToEventLoop();
        }

        const cached = cachedFor(up.mid, now);
        if (cached) {
          if (cached.l1) {
            assign(
              up.mid,
              cached.l1,
              cached.l2,
              cached.source,
              cached.confidence,
            );
          }
          reusedCount++;
          if (cached.version !== version) reusedStale++;
          continue;
        }

        let titles: string[] = [];
        let { match, level } = classifyUpEvidence(up, titles);
        const profileOnly =
          level === "rule" && match != null && match.score >= CONFIDENT_SCORE;
        if (!profileOnly) {
          const cachedTitles = titleCache[String(up.mid)];
          if (cachedTitles && now - cachedTitles.at < TITLE_TTL_MS) {
            titles = cachedTitles.titles;
          } else if (!titlesDisabled) {
            await sleep(TITLE_FETCH_DELAY_MS);
            try {
              titles = await biliApi.getRecentVideoTitles(up.mid, TITLE_LIMIT);
              titleCache[String(up.mid)] = { titles, at: Date.now() };
              failStreak = 0;
            } catch {
              titleFetchFailed++;
              failStreak++;
              if (failStreak >= TITLE_MAX_FAIL_STREAK) titlesDisabled = true;
              else await sleep(TITLE_BACKOFF_MS * Math.min(failStreak, 4));
            }
          }
          const latest = latestTitles.get(up.mid);
          if (titles.length === 0 && latest) titles = [latest];
          const withTitles = classifyUpEvidence(up, titles);
          if (level !== "rule" && withTitles.level === "rule") titleHelped++;
          ({ match, level } = withTitles);
        }

        if (match && level === "rule") {
          assign(up.mid, match.l1, match.l2, "rule", 100);
          remember(up.mid, {
            l1: match.l1,
            l2: match.l2,
            source: "rule",
            confidence: 100,
          });
          ruleCount++;
        } else {
          pending.push({ up, titles });
        }

        if (index % 50 === 49) appStore.set("upTitleCache", titleCache);
      }
      appStore.set("upTitleCache", titleCache);
      flushCache(true);

      let aiCount = 0;
      let aiFailed = 0;
      /** AI 调用出错的 UP 不写缓存，下次还会重试 */
      const aiErrored = new Set<number>();
      let leftover = pending;
      if (useAi && pending.length > 0) {
        leftover = [];
        const system = aiSystemPrompt(suggestedTreeText().join("\n"));
        for (let index = 0; index < pending.length; index++) {
          const { up, titles } = pending[index];
          if (index % 5 === 0) {
            taxonomyRepo.updateTask(taskId, {
              progress: Math.round(80 + (index / pending.length) * 15),
              message: `AI 分类 ${index + 1}/${pending.length}：${up.uname}`,
            });
          }
          try {
            const response = await aiService.chat(
              system,
              [
                `UP昵称: ${up.uname}`,
                `签名: ${cleanUpSign(up.sign)}`,
                `认证: ${up.official?.title ?? ""}`,
                titles.length > 0
                  ? `近期视频: ${titles.slice(0, 10).join(" | ")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            );
            const parsed = JSON.parse(
              response.match(/\{[\s\S]*\}/)?.[0] ?? "null",
            ) as {
              l1?: string;
              l2?: string;
            } | null;
            const picked = normalizeAiPick(
              String(parsed?.l1 ?? ""),
              String(parsed?.l2 ?? ""),
            );
            if (picked) {
              assign(up.mid, picked.l1, picked.l2, "ai", 80);
              remember(up.mid, { ...picked, source: "ai", confidence: 80 });
              aiCount++;
              continue;
            }
          } catch {
            aiFailed++;
            aiErrored.add(up.mid);
          }
          leftover.push(pending[index]);
        }
        flushCache(true);
      }

      // 证据少但有倾向的先归过去（低把握），完全没线索的留在未分组
      let weakCount = 0;
      for (const { up, titles } of leftover) {
        const { match, level } = classifyUpEvidence(up, titles);
        const result =
          match && level
            ? {
                l1: match.l1,
                l2: match.l2,
                source: "rule-weak" as const,
                confidence: 40,
              }
            : { l1: "", l2: "", source: "none" as const, confidence: 0 };
        if (result.l1) {
          assign(
            up.mid,
            result.l1,
            result.l2,
            result.source,
            result.confidence,
          );
          weakCount++;
        }
        if (!aiErrored.has(up.mid)) remember(up.mid, result);
      }
      flushCache(true);

      taxonomyRepo.replaceAllUpMembers(assignments);
      taxonomyRepo.pruneEmptyAiUpGroups();
      if (mode === "deep") appStore.set("upClassifyDeepRun", null);

      const ungrouped = followings.length - assignments.length;
      const judged = followings.length - reusedCount;
      const parts: string[] = [];
      if (reusedCount > 0) parts.push(`沿用上次 ${reusedCount}`);
      parts.push(`规则 ${ruleCount}（其中靠视频标题 ${titleHelped}）`);
      if (useAi) parts.push(`AI ${aiCount}`);
      if (weakCount > 0) parts.push(`低把握 ${weakCount}`);
      parts.push(`未分组 ${ungrouped}`);
      const head =
        mode === "deep"
          ? resumedDeep
            ? "深度整理完成（接着上次继续）"
            : "深度整理完成"
          : judged === 0
            ? "浅层整理完成，没有需要新判断的 UP"
            : `浅层整理完成，新判断 ${judged} 位`;
      let message = `${head}，共 ${followings.length} 位：${parts.join("，")}`;
      if (reusedStale > 0) {
        message += `；其中 ${reusedStale} 位是旧规则的结果，分类规则已更新，建议做一次深度整理`;
      }
      if (titlesDisabled) {
        message += "；B 站限流，后半段没抓视频标题，过一阵再整理会用缓存补全";
      } else if (titleFetchFailed > 0) {
        message += `；${titleFetchFailed} 位的视频标题没抓到`;
      }
      if (aiFailed > 0)
        message += `；AI 调用失败 ${aiFailed} 次，下次整理会重试这些 UP`;
      if (!useAi && weakCount + ungrouped > 0)
        message += "；配置 AI Key 后低把握 / 未分组的会更准";

      taxonomyRepo.updateTask(taskId, {
        status: "done",
        progress: 100,
        message,
      });
    } catch (error) {
      flushCache(true);
      const base = error instanceof Error ? error.message : "分类任务失败";
      taxonomyRepo.updateTask(taskId, {
        status: "failed",
        progress: 100,
        message: `${base}。已判断的 UP 都存下了，再次整理会接着来，不用从头判断`,
      });
    }
  }

  startUpClassification(mode: UpClassifyMode = "shallow"): number {
    if (this.runningTaskId != null) return this.runningTaskId;
    const task = taxonomyRepo.createTask(`up_classification_${mode}`);
    this.runningTaskId = task.id;
    void this.runUpClassification(task.id, mode).finally(() => {
      this.runningTaskId = null;
    });
    return task.id;
  }
}

export const classifyEngine = new ClassifyEngine();
