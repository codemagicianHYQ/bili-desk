import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { CommentItem } from "@shared/types";

export function commentTreeHas(item: CommentItem, rpid: number): boolean {
  if (item.rpid === rpid) return true;
  return item.replies.some((reply) => commentTreeHas(reply, rpid));
}

export function mergeCommentReplies(
  root: CommentItem,
  extra: CommentItem[],
): CommentItem {
  const seen = new Set<number>();
  const replies: CommentItem[] = [];
  const push = (reply: CommentItem) => {
    if (seen.has(reply.rpid)) return;
    seen.add(reply.rpid);
    replies.push(reply);
  };
  // 以接口全量页为主：seek_rpid 常只带定位路径，先放 extra 再补原路径上的节点
  for (const reply of extra) push(reply);
  for (const reply of root.replies) push(reply);
  return {
    ...root,
    replies,
    rcount: Math.max(root.rcount, replies.length),
  };
}

export function scrollCommentIntoView(rpid: number): boolean {
  const node = document.querySelector(`[data-comment-rpid="${rpid}"]`);
  if (!(node instanceof HTMLElement)) return false;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

export function useFocusComment(options: {
  comments: CommentItem[];
  setComments: Dispatch<SetStateAction<CommentItem[]>>;
  focusRpid?: number;
  focusRoot?: number;
  loadReplies?: (root: number) => Promise<CommentItem[]>;
}): void {
  const { comments, setComments, focusRpid = 0, focusRoot = 0, loadReplies } =
    options;
  const pulledRef = useRef(0);

  useEffect(() => {
    if (!focusRpid || comments.length === 0) return;
    const rootId = focusRoot > 0 ? focusRoot : focusRpid;
    const root =
      comments.find((item) => item.rpid === rootId) ??
      comments.find((item) => commentTreeHas(item, focusRpid));
    if (!root) return;

    const reveal = () => {
      let tries = 0;
      const timer = window.setInterval(() => {
        const found = scrollCommentIntoView(focusRpid);
        tries += 1;
        if (found || tries > 16) window.clearInterval(timer);
      }, 140);
      return () => window.clearInterval(timer);
    };

    // seek_rpid 已命中时树里往往只有定位链路，仍须拉全量楼中楼补齐兄弟评论
    if (pulledRef.current === focusRpid) {
      return reveal();
    }
    if (!loadReplies) return reveal();

    pulledRef.current = focusRpid;
    let cancel = false;
    let stopScroll: () => void = () => {};
    void loadReplies(root.rpid)
      .then((extra) => {
        if (cancel) return;
        setComments((current) =>
          current.map((item) =>
            item.rpid === root.rpid ? mergeCommentReplies(item, extra) : item,
          ),
        );
        stopScroll = reveal();
      })
      .catch(() => {
        if (!cancel) stopScroll = reveal();
      });
    return () => {
      cancel = true;
      stopScroll();
    };
  }, [comments, focusRoot, focusRpid, loadReplies, setComments]);
}
