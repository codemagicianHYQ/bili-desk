import type { CommentItem } from "@shared/types";

export function commentRpid(item: CommentItem): string | number {
  return item.rpidStr || item.rpid;
}

function countTree(replies: CommentItem[]): number {
  return replies.reduce((n, reply) => n + 1 + countTree(reply.replies), 0);
}

export function countCommentTree(item: CommentItem): number {
  return 1 + countTree(item.replies);
}

/** 接口常把楼中楼拍扁；按 parent 还原成官网那种多级树 */
export function nestCommentReplies(
  replies: CommentItem[],
  rootRpid: number,
): CommentItem[] {
  const flat: CommentItem[] = [];
  const seen = new Set<number>();
  const walk = (list: CommentItem[]) => {
    for (const item of list) {
      if (seen.has(item.rpid)) continue;
      seen.add(item.rpid);
      flat.push(item);
      if (item.replies?.length) walk(item.replies);
    }
  };
  walk(replies);

  const nodes = new Map<number, CommentItem>();
  for (const item of flat) {
    nodes.set(item.rpid, { ...item, replies: [] });
  }

  const roots: CommentItem[] = [];
  for (const item of flat) {
    const node = nodes.get(item.rpid);
    if (!node) continue;
    const parentId = item.parent;
    if (
      parentId > 0 &&
      parentId !== item.rpid &&
      parentId !== rootRpid &&
      nodes.has(parentId)
    ) {
      nodes.get(parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function formatCommentTime(ctime: number): string {
  if (!ctime) return "";
  const date = new Date(ctime * 1000);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** 从评论树里摘掉一条（含子楼），并返回实际去掉的条数，用来改总数 */
export function stripComment(
  list: CommentItem[],
  rpid: number,
): { list: CommentItem[]; removed: number } {
  let removed = 0;
  const next = list
    .filter((item) => {
      if (item.rpid === rpid) {
        removed += 1 + countTree(item.replies);
        return false;
      }
      return true;
    })
    .map((item) => {
      const child = stripComment(item.replies, rpid);
      if (child.removed === 0) return item;
      removed += child.removed;
      return {
        ...item,
        replies: child.list,
        rcount: Math.max(0, item.rcount - child.removed),
      };
    });
  return { list: next, removed };
}
