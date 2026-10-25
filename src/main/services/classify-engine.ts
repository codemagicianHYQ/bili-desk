import { aiService } from "./ai-service";
import { biliApi } from "./bili-api";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { appStore } from "../store/app-store";
import {
  isConfident,
  scoreEvidence,
  suggestedTreeText,
} from "./collection-taxonomy";
import { buildUpEvidence, cleanUpSign } from "./up-evidence";

const TITLE_FETCH_DELAY_MS = 350;
const TITLE_BACKOFF_MS = 4000;
const TITLE_LIMIT = 15;
const TITLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** 连续这么多次抓标题失败（基本是被限流）就不再抓，剩下的只按资料分 */
const TITLE_MAX_FAIL_STREAK = 15;
/** 只看资料就能确定时不再抓标题 */
const CONFIDENT_SCORE = 12;
const MIN_SCORE = 6;

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

export class ClassifyEngine {
  async runUpClassification(taskId: number): Promise<void> {
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
      const group = writer.findOrCreateL2(
        writer.findOrCreateL1(l1).id,
        l2 || "综合",
      );
      assignments.push({ mid, groupId: group.id, source, confidence });
    };

    try {
      taxonomyRepo.updateTask(taskId, {
        status: "running",
        progress: 5,
        message: "获取关注列表...",
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
      const pending: Array<{ up: FollowingUp; titles: string[] }> = [];

      for (let index = 0; index < followings.length; index++) {
        const up = followings[index];
        if (index % 10 === 0) {
          taxonomyRepo.updateTask(taskId, {
            progress: Math.round(5 + (index / followings.length) * 75),
            message: `分析 ${index + 1}/${followings.length}：${up.uname}`,
          });
          await yieldToEventLoop();
        }

        let titles: string[] = [];
        let match = scoreEvidence(buildUpEvidence(up, titles));
        if (!isConfident(match, CONFIDENT_SCORE)) {
          const cached = titleCache[String(up.mid)];
          if (cached && now - cached.at < TITLE_TTL_MS) {
            titles = cached.titles;
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
          const withTitles = scoreEvidence(buildUpEvidence(up, titles));
          if (
            !isConfident(match, MIN_SCORE) &&
            isConfident(withTitles, MIN_SCORE)
          )
            titleHelped++;
          match = withTitles;
        }

        if (match && isConfident(match, MIN_SCORE)) {
          assign(up.mid, match.l1, match.l2, "rule", 100);
          ruleCount++;
        } else {
          pending.push({ up, titles });
        }

        if (index % 50 === 49) appStore.set("upTitleCache", titleCache);
      }
      appStore.set("upTitleCache", titleCache);

      let aiCount = 0;
      let aiFailed = 0;
      const useAi = hasAiConfigured();
      let leftover = pending;
      if (useAi && pending.length > 0) {
        leftover = [];
        const tree = suggestedTreeText().join("\n");
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
              `你是 B 站 UP 主分类助手，把 UP 归入「一级/二级」两层分类。参考目录（一级从这里选，二级可按内容补充）：\n${tree}\n以近期视频标题为主要依据，签名只作参考。只返回 JSON: {"l1":"一级","l2":"二级"}`,
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
            const l1 = String(parsed?.l1 ?? "")
              .trim()
              .slice(0, 8);
            if (l1) {
              assign(
                up.mid,
                l1,
                String(parsed?.l2 ?? "")
                  .trim()
                  .slice(0, 10),
                "ai",
                80,
              );
              aiCount++;
              continue;
            }
          } catch {
            aiFailed++;
          }
          leftover.push(pending[index]);
        }
      }

      // 证据少但有倾向的先归过去（低把握），完全没线索的留在未分组
      let weakCount = 0;
      for (const { up, titles } of leftover) {
        const match = scoreEvidence(buildUpEvidence(up, titles));
        if (match && match.score >= 3 && match.score > match.runnerUp) {
          assign(up.mid, match.l1, match.l2, "rule-weak", 40);
          weakCount++;
        }
      }

      taxonomyRepo.replaceAllUpMembers(assignments);
      taxonomyRepo.pruneEmptyAiUpGroups();

      const ungrouped = followings.length - assignments.length;
      const parts = [`规则 ${ruleCount}（其中靠视频标题 ${titleHelped}）`];
      if (useAi) parts.push(`AI ${aiCount}`);
      if (weakCount > 0) parts.push(`低把握 ${weakCount}`);
      parts.push(`未分组 ${ungrouped}`);
      let message = `已分类 ${followings.length} 位 UP：${parts.join("，")}`;
      if (titlesDisabled) {
        message += "；B 站限流，后半段没抓视频标题，过一阵重新分类会用缓存补全";
      } else if (titleFetchFailed > 0) {
        message += `；${titleFetchFailed} 位的视频标题没抓到`;
      }
      if (aiFailed > 0) message += `；AI 调用失败 ${aiFailed} 次`;
      if (!useAi && weakCount + ungrouped > 0)
        message += "；配置 AI Key 后低把握 / 未分组的会更准";

      taxonomyRepo.updateTask(taskId, {
        status: "done",
        progress: 100,
        message,
      });
    } catch (error) {
      taxonomyRepo.updateTask(taskId, {
        status: "failed",
        progress: 100,
        message: error instanceof Error ? error.message : "分类任务失败",
      });
    }
  }

  startUpClassification(): number {
    const task = taxonomyRepo.createTask("up_classification");
    void this.runUpClassification(task.id);
    return task.id;
  }
}

export const classifyEngine = new ClassifyEngine();
