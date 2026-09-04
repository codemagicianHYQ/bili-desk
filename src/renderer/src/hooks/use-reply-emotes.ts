import { useEffect, useState } from "react";
import type { ReplyEmotePanel } from "@shared/types";

let cachedPanel: ReplyEmotePanel | null = null;
let cachedEmotes: Record<string, string> | null = null;
let loadingPromise: Promise<ReplyEmotePanel> | null = null;

function emptyPanel(): ReplyEmotePanel {
  return { packages: [], map: {} };
}

async function loadReplyEmotePanel(): Promise<ReplyEmotePanel> {
  if (cachedPanel) return cachedPanel;
  if (!loadingPromise) {
    loadingPromise = window.biliDesk.bili
      .getReplyEmotes()
      .then((panel) => {
        cachedPanel = panel ?? emptyPanel();
        cachedEmotes = cachedPanel.map ?? {};
        return cachedPanel;
      })
      .catch(() => {
        cachedPanel = cachedPanel ?? emptyPanel();
        cachedEmotes = cachedEmotes ?? {};
        return cachedPanel;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  return loadingPromise;
}

export function loadReplyEmotes(): Promise<Record<string, string>> {
  return loadReplyEmotePanel().then((panel) => panel.map);
}

export function loadReplyEmotePackages(): Promise<ReplyEmotePanel> {
  return loadReplyEmotePanel();
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
