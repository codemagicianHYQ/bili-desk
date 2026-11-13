import type {
  UpPortraitDomain,
  UpPortraitGraph,
  UpPortraitLink,
  UpPortraitMember,
  UpPortraitProgress,
  UpPortraitTag,
  FollowingUp,
} from "@shared/types";
import { BrowserWindow } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore, type UpClassifyCacheEntry } from "../store/app-store";
import { biliApi } from "./bili-api";
import { scoreEvidenceTags } from "./collection-taxonomy";
import { buildUpEvidence } from "./up-evidence";

const L1_COLORS: Record<string, string> = {
  计算机: "#60a5fa",
  AI: "#22d3ee",
  技能: "#f472b6",
  科技: "#818cf8",
  学习: "#a78bfa",
  人文社科: "#d6a35c",
  财经商业: "#facc15",
  娱乐: "#fb923c",
  生活: "#4ade80",
  其他: "#94a3b8",
  未归类: "#94a3b8",
};

const UNTAGGED_ID = "l1:未归类";

interface StoredPortrait {
  mid: number;
  uname: string;
  face: string;
  tags: UpPortraitTag[];
  headline: string;
  updatedAt: number;
}

function domainColor(l1: string): string {
  return L1_COLORS[l1] ?? "#94a3b8";
}

function l1Id(name: string): string {
  return `l1:${name}`;
}

function l2Id(l1: string, l2: string): string {
  return `l2:${l1}/${l2}`;
}

function tagKey(tag: UpPortraitTag): string {
  return `${tag.l1}/${tag.l2}`;
}

/** 本地分组结果放在第一位，其余标签按投稿/签名分数补上 */
function mergeTags(
  scored: UpPortraitTag[],
  cached: UpClassifyCacheEntry | undefined,
): UpPortraitTag[] {
  const tags = scored.map((tag) => ({ ...tag }));
  if (cached?.l1 && cached.l2) {
    const key = `${cached.l1}/${cached.l2}`;
    const existing = tags.findIndex((tag) => tagKey(tag) === key);
    const primary: UpPortraitTag =
      existing >= 0
        ? tags.splice(existing, 1)[0]
        : {
            l1: cached.l1,
            l2: cached.l2,
            score: Math.max(cached.confidence || 0, 4),
          };
    tags.unshift(primary);
  }
  const seen = new Set<string>();
  return tags
    .filter((tag) => {
      const key = tagKey(tag);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function headlineOf(tags: UpPortraitTag[]): string {
  if (tags.length === 0) return "未归类";
  const [primary, ...rest] = tags;
  const main = `${primary.l1} · ${primary.l2}`;
  if (rest.length === 0) return main;
  return `${main}，也涉及${rest.map((tag) => tag.l2).join("、")}`;
}

function projectGraph(
  items: StoredPortrait[],
  updatedAt: number,
  titledCount: number,
): UpPortraitGraph {
  const l1Members = new Map<string, Set<number>>();
  const l2Members = new Map<string, Set<number>>();
  const l2Parent = new Map<string, string>();
  const cross = new Map<string, number>();
  const l1Cross = new Map<string, number>();

  const members: UpPortraitMember[] = items.map((item) => {
    if (item.tags.length === 0) {
      return {
        mid: item.mid,
        uname: item.uname,
        face: item.face,
        domainId: UNTAGGED_ID,
        also: [],
        tags: [],
        headline: item.headline,
      };
    }
    const ids = item.tags.map((tag) => l2Id(tag.l1, tag.l2));
    item.tags.forEach((tag, index) => {
      const id = ids[index];
      const parent = l1Id(tag.l1);
      l2Parent.set(id, parent);
      const bucket = l2Members.get(id) ?? new Set<number>();
      bucket.add(item.mid);
      l2Members.set(id, bucket);
      const l1Bucket = l1Members.get(tag.l1) ?? new Set<number>();
      l1Bucket.add(item.mid);
      l1Members.set(tag.l1, l1Bucket);
    });
    for (let i = 0; i < item.tags.length; i++) {
      for (let j = i + 1; j < item.tags.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
        cross.set(pair, (cross.get(pair) ?? 0) + 1);
        const la = item.tags[i].l1;
        const lb = item.tags[j].l1;
        if (la !== lb) {
          const lpair = la < lb ? `${la}|${lb}` : `${lb}|${la}`;
          l1Cross.set(lpair, (l1Cross.get(lpair) ?? 0) + 1);
        }
      }
    }
    return {
      mid: item.mid,
      uname: item.uname,
      face: item.face,
      domainId: ids[0],
      also: ids.slice(1),
      tags: item.tags.map((tag) => `${tag.l1}/${tag.l2}`),
      headline: item.headline,
    };
  });

  const untagged = members.filter((member) => member.domainId === UNTAGGED_ID);
  const domains: UpPortraitDomain[] = [];
  for (const [name, mids] of l1Members) {
    domains.push({
      id: l1Id(name),
      parentId: null,
      name,
      level: 1,
      count: mids.size,
      color: domainColor(name),
    });
  }
  if (untagged.length > 0) {
    domains.push({
      id: UNTAGGED_ID,
      parentId: null,
      name: "未归类",
      level: 1,
      count: untagged.length,
      color: domainColor("未归类"),
    });
  }
  for (const [id, mids] of l2Members) {
    const parentId = l2Parent.get(id) ?? null;
    const name = id.slice(id.indexOf("/") + 1);
    const l1 = parentId?.slice(3) ?? "";
    domains.push({
      id,
      parentId,
      name,
      level: 2,
      count: mids.size,
      color: domainColor(l1),
    });
  }
  domains.sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"),
  );

  const links: UpPortraitLink[] = [];
  for (const domain of domains) {
    if (domain.level !== 2 || !domain.parentId) continue;
    links.push({
      source: domain.parentId,
      target: domain.id,
      weight: domain.count,
      kind: "parent",
    });
  }
  const crossLinks = [...cross.entries()]
    .filter(([, weight]) => weight >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);
  for (const [pair, weight] of crossLinks) {
    const [source, target] = pair.split("|");
    links.push({ source, target, weight, kind: "cross" });
  }
  for (const [pair, weight] of l1Cross) {
    if (weight < 2) continue;
    const [left, right] = pair.split("|");
    links.push({
      source: l1Id(left),
      target: l1Id(right),
      weight,
      kind: "l1",
    });
  }

  return {
    updatedAt,
    upCount: items.length,
    taggedCount: items.length - untagged.length,
    titledCount,
    domains,
    links,
    members,
  };
}

function readStored(): {
  updatedAt: number;
  titledCount: number;
  items: StoredPortrait[];
} {
  const stored = appStore.get("upPortraits");
  return stored ?? { updatedAt: 0, titledCount: 0, items: [] };
}

export function readUpPortraitGraph(): UpPortraitGraph {
  const stored = readStored();
  return projectGraph(stored.items, stored.updatedAt, stored.titledCount);
}

function emitProgress(progress: UpPortraitProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.TAXONOMY_UP_PORTRAIT_PROGRESS, progress);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 分页拉关注，每页回报一次，避免整段没有反馈 */
async function loadFollowings(): Promise<FollowingUp[]> {
  const all: FollowingUp[] = [];
  const seen = new Set<number>();
  let page = 1;
  while (page <= 200) {
    const batch = await biliApi.getFollowings(page);
    if (batch.length === 0) break;
    let fresh = 0;
    for (const up of batch) {
      if (seen.has(up.mid)) continue;
      seen.add(up.mid);
      all.push(up);
      fresh += 1;
    }
    emitProgress({
      running: true,
      phase: "followings",
      done: all.length,
      total: 0,
      message: `正在读取关注列表，已拿到 ${all.length} 位`,
    });
    if (fresh === 0 || batch.length < 50) break;
    page += 1;
    await wait(350);
  }
  return all;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 用关注列表、已缓存的投稿标题和本地分组结果重建画像库，不额外抓标题 */
export async function rebuildUpPortraits(): Promise<UpPortraitGraph> {
  emitProgress({
    running: true,
    phase: "followings",
    done: 0,
    total: 0,
    message: "正在读取关注列表…",
  });
  try {
    const followings = await loadFollowings();
    const titleCache = appStore.get("upTitleCache") ?? {};
    const classifyCache = appStore.get("upClassifyCache") ?? {};
    const now = Date.now();
    let titledCount = 0;
    const items: StoredPortrait[] = [];
    const total = followings.length;
    for (let index = 0; index < followings.length; index++) {
      const up = followings[index];
      const titles = titleCache[String(up.mid)]?.titles ?? [];
      if (titles.length > 0) titledCount += 1;
      const tags = mergeTags(
        scoreEvidenceTags(buildUpEvidence(up, titles)),
        classifyCache[String(up.mid)],
      );
      items.push({
        mid: up.mid,
        uname: up.uname,
        face: up.face,
        tags,
        headline: headlineOf(tags),
        updatedAt: now,
      });
      if (index % 80 === 0 || index === followings.length - 1) {
        emitProgress({
          running: true,
          phase: "tagging",
          done: index + 1,
          total,
          message: `正在贴标签 ${index + 1} / ${total}`,
        });
        await yieldToEventLoop();
      }
    }
    appStore.set("upPortraits", { updatedAt: now, titledCount, items });
    const graph = projectGraph(items, now, titledCount);
    emitProgress({
      running: false,
      phase: "done",
      done: total,
      total,
      message: `已为 ${total} 位 UP 建立画像`,
    });
    return graph;
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像更新失败";
    emitProgress({
      running: false,
      phase: "error",
      done: 0,
      total: 0,
      message,
    });
    throw error;
  }
}
