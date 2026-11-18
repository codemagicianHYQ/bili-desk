import { useEffect, useState } from "react";
let cachedPanel = null;
let cachedEmotes = null;
let loadingPromise = null;
function emptyPanel() {
    return { packages: [], map: {} };
}
async function loadReplyEmotePanel() {
    if (cachedPanel)
        return cachedPanel;
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
export function loadReplyEmotes() {
    return loadReplyEmotePanel().then((panel) => panel.map);
}
export function loadReplyEmotePackages() {
    return loadReplyEmotePanel();
}
/** 评论区表情面板（全局缓存）；单条评论自带的 emotes 会覆盖同名项 */
export function useReplyEmotes(localEmotes) {
    const [panel, setPanel] = useState(() => cachedEmotes ?? {});
    useEffect(() => {
        let cancelled = false;
        void loadReplyEmotes().then((map) => {
            if (!cancelled)
                setPanel(map);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (!localEmotes || Object.keys(localEmotes).length === 0)
        return panel;
    return { ...panel, ...localEmotes };
}
