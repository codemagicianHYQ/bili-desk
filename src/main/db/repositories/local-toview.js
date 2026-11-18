import { appStore } from "../../store/app-store";
function readList() {
    const stored = appStore.get("localToView");
    return Array.isArray(stored) ? stored : [];
}
function writeList(videos) {
    appStore.set("localToView", videos);
}
function toLocalItem(video, aid, bvid) {
    return {
        bvid,
        aid: video?.aid || aid,
        title: video?.title || bvid,
        cover: video?.cover || "",
        duration: video?.duration || 0,
        play: video?.play || 0,
        danmaku: video?.danmaku || 0,
        owner: video?.owner ?? { mid: 0, name: "", face: "" },
        pubdate: video?.pubdate || 0,
        progress: 0,
        addAt: Math.floor(Date.now() / 1000),
        cid: 0,
    };
}
export const localToViewRepo = {
    list() {
        return readList();
    },
    add(video, aid, bvid) {
        const list = readList();
        const existing = list.find((item) => item.bvid === bvid);
        if (existing)
            return existing;
        const item = toLocalItem(video, aid, bvid);
        writeList([item, ...list]);
        return item;
    },
    remove(bvid) {
        writeList(readList().filter((item) => item.bvid !== bvid));
    },
    removeMany(bvids) {
        if (bvids.length === 0)
            return;
        const drop = new Set(bvids);
        writeList(readList().filter((item) => !drop.has(item.bvid)));
    },
};
