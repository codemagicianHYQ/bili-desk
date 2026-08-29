import type { CommentItem } from "@shared/types";

export function commentRpid(item: CommentItem): string | number {
  return item.rpidStr || item.rpid;
}

function countTree(replies: CommentItem[]): number {
  return replies.reduce((n, reply) => n + 1 + countTree(reply.replies), 0);
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
