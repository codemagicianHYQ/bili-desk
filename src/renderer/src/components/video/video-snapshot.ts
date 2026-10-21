import type { VideoSnapshot } from "@shared/types";

/** Artplayer `thumbnails` 选项 */
export interface PlayerThumbnails {
  url: string;
  number: number;
  column: number;
  width: number;
  height: number;
}

const MAX_CACHED = 4;
const cache = new Map<string, Promise<PlayerThumbnails | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("预览图加载失败"));
    img.src = src;
  });
}

/** Artplayer 只认一张图，把多张雪碧图竖着拼起来，帧序号自然连续 */
async function stitch(shot: VideoSnapshot): Promise<PlayerThumbnails | null> {
  const images = await Promise.all(shot.images.map(loadImage));
  const sheetWidth = shot.column * shot.frameWidth;
  const sheetHeight = shot.row * shot.frameHeight;
  const canvas = document.createElement("canvas");
  canvas.width = sheetWidth;
  canvas.height = sheetHeight * images.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  images.forEach((img, index) => {
    ctx.drawImage(img, 0, index * sheetHeight, sheetWidth, sheetHeight);
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) return null;
  return {
    url: URL.createObjectURL(blob),
    number: shot.frameCount,
    column: shot.column,
    width: shot.frameWidth,
    height: shot.frameHeight,
  };
}

async function fetchThumbnails(
  bvid: string,
  cid: number,
): Promise<PlayerThumbnails | null> {
  try {
    const shot = await window.biliDesk.bili.getVideoSnapshot(bvid, cid);
    return shot ? await stitch(shot) : null;
  } catch {
    return null;
  }
}

export function loadPlayerThumbnails(
  bvid: string,
  cid: number,
): Promise<PlayerThumbnails | null> {
  const key = `${bvid}:${cid}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const task = fetchThumbnails(bvid, cid);
  cache.set(key, task);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    void stale?.then((thumb) => {
      if (thumb) URL.revokeObjectURL(thumb.url);
    });
  }
  return task;
}
