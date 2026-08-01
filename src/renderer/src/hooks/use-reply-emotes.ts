import { useEffect, useState } from "react";

let cachedEmotes: Record<string, string> | null = null;
let loadingPromise: Promise<Record<string, string>> | null = null;

async function loadReplyEmotes(): Promise<Record<string, string>> {
  if (cachedEmotes) return cachedEmotes;
  if (!loadingPromise) {
    loadingPromise = window.biliDesk.bili
      .getReplyEmotes()
      .then((map) => {
        cachedEmotes = map ?? {};
        return cachedEmotes;
      })
      .catch(() => {
        cachedEmotes = cachedEmotes ?? {};
        return cachedEmotes;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  return loadingPromise;
}

/** 评论区表情面板（全局缓存）；单条评论自带的 emotes 会覆盖同名项 */
export function useReplyEmotes(
  localEmotes?: Record<string, string>,
): Record<string, string> {
  const [panel, setPanel] = useState<Record<string, string>>(
    () => cachedEmotes ?? {},
  );

  useEffect(() => {
    let cancelled = false;
    void loadReplyEmotes().then((map) => {
      if (!cancelled) setPanel(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!localEmotes || Object.keys(localEmotes).length === 0) return panel;
  return { ...panel, ...localEmotes };
}
