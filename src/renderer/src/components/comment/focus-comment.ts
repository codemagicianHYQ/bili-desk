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
  const seen = new Set(root.replies.map((reply) => reply.rpid));
  const replies = [...root.replies];
  for (const reply of extra) {
    if (seen.has(reply.rpid)) continue;
    seen.add(reply.rpid);
    replies.push(reply);
  }
  return { ...root, replies };
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
        if (found || tries > 12) window.clearInterval(timer);
      }, 140);
      return () => window.clearInterval(timer);
    };

    if (commentTreeHas(root, focusRpid) || pulledRef.current === focusRpid) {
      return reveal();
    }
    if (!loadReplies) return reveal();

    pulledRef.current = focusRpid;
    let cancel = false;
    let stopScroll = () => undefined;
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
