import type { BiliDashPlayInfo, BiliDashTrackInfo } from "@shared/types";

interface ByteRange {
  start: number;
  end: number;
}

interface MediaFragment extends ByteRange {
  time: number;
  duration: number;
}

function parseRange(raw: string): ByteRange | null {
  const match = raw.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end };
}

function readType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function findBox(buffer: ArrayBuffer, target: string): number {
  const view = new DataView(buffer);
  let offset = 0;
  while (offset + 8 <= view.byteLength) {
    const size32 = view.getUint32(offset);
    const type = readType(view, offset + 4);
    let size = size32;
    if (size32 === 1 && offset + 16 <= view.byteLength) {
      size = Number(view.getBigUint64(offset + 8));
    } else if (size32 === 0) {
      size = view.byteLength - offset;
    }
    if (size < 8) break;
    if (type === target) return offset;
    offset += size;
  }
  return 0;
}

function parseSidx(
  buffer: ArrayBuffer,
  sidxFileOffset: number,
): MediaFragment[] {
  const boxAt = findBox(buffer, "sidx");
  const view = new DataView(buffer, boxAt);
  if (view.byteLength < 32) return [];
  let i = 0;
  const size32 = view.getUint32(i);
  i += 8;
  let boxSize = size32;
  if (size32 === 1) {
    boxSize = Number(view.getBigUint64(i));
    i += 8;
  } else if (size32 === 0) {
    boxSize = view.byteLength;
  }
  const version = view.getUint8(i);
  i += 4;
  i += 4;
  const timescale = view.getUint32(i) || 1000;
  i += 4;
  let earliest = 0;
  let firstOffset = 0;
  if (version === 0) {
    earliest = view.getUint32(i);
    i += 4;
    firstOffset = view.getUint32(i);
    i += 4;
  } else {
    earliest = Number(view.getBigUint64(i));
    i += 8;
    firstOffset = Number(view.getBigUint64(i));
    i += 8;
  }
  i += 2;
  const count = view.getUint16(i);
  i += 2;
  let mediaPos = sidxFileOffset + boxAt + boxSize + firstOffset;
  let timeUnits = earliest;
  const fragments: MediaFragment[] = [];
  for (let n = 0; n < count && i + 12 <= view.byteLength; n += 1) {
    const mixed = view.getUint32(i);
    i += 4;
    const durationUnits = view.getUint32(i);
    i += 8;
    const refType = mixed >>> 31;
    const refSize = mixed & 0x7fffffff;
    if (refType === 0 && refSize > 0) {
      fragments.push({
        start: mediaPos,
        end: mediaPos + refSize - 1,
        time: timeUnits / timescale,
        duration: durationUnits / timescale,
      });
    }
    mediaPos += refSize;
    timeUnits += durationUnits;
  }
  return fragments;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

async function fetchRange(
  track: BiliDashTrackInfo,
  range: string,
): Promise<Uint8Array> {
  const urls = [track.url, ...(track.backupUrls ?? [])].filter(Boolean);
  let lastError: unknown;
  for (const url of urls) {
    try {
      const data = await window.biliDesk.bili.fetchMediaRange(
        url,
        range,
        track.referer,
      );
      if (data instanceof Uint8Array) return data;
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      throw new Error("媒体分片格式无效");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("拉流失败");
}

function waitUpdate(
  sourceBuffer: SourceBuffer,
  signal: AbortSignal,
): Promise<void> {
  if (!sourceBuffer.updating) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("SourceBuffer 追加失败"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", onEnd);
      sourceBuffer.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    sourceBuffer.addEventListener("updateend", onEnd);
    sourceBuffer.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function appendBuffer(
  sourceBuffer: SourceBuffer,
  data: Uint8Array,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  sourceBuffer.appendBuffer(toArrayBuffer(data));
  await waitUpdate(sourceBuffer, signal);
}

function stopMediaElement(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // ignore
  }
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
}

function sourceMime(track: BiliDashTrackInfo): string {
  const mime = track.mimeType || "video/mp4";
  return `${mime}; codecs="${track.codecs}"`;
}

function fragIndexAt(frags: MediaFragment[], time: number): number {
  if (frags.length === 0) return 0;
  for (let i = 0; i < frags.length; i += 1) {
    const end = frags[i].time + Math.max(frags[i].duration, 0.05);
    if (time < end) return i;
  }
  return frags.length - 1;
}

function hasTime(video: HTMLVideoElement, time: number): boolean {
  const ranges = video.buffered;
  for (let i = 0; i < ranges.length; i += 1) {
    if (ranges.start(i) - 0.25 <= time && time < ranges.end(i) - 0.08) {
      return true;
    }
  }
  return false;
}

function aheadAt(video: HTMLVideoElement, time: number): number {
  const ranges = video.buffered;
  for (let i = 0; i < ranges.length; i += 1) {
    if (ranges.start(i) - 0.25 <= time && time < ranges.end(i)) {
      return ranges.end(i) - time;
    }
  }
  return 0;
}

function rangeHeader(frag: MediaFragment): string {
  if (frag.end >= 0x7fffffff) return `${frag.start}-`;
  return `${frag.start}-${frag.end}`;
}

export function attachBiliDash(
  video: HTMLVideoElement,
  dash: BiliDashPlayInfo,
  onError: (message: string) => void,
): () => void {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const abort = new AbortController();
  video.src = objectUrl;

  console.warn("[BiliDesk][dash-mse] start", {
    duration: dash.duration,
    video: dash.video.codecs,
    audio: dash.audio.codecs,
  });

  const onSourceOpen = () => {
    void (async () => {
      try {
        mediaSource.duration = dash.duration;
        const videoType = sourceMime(dash.video);
        const audioType = sourceMime(dash.audio);
        if (!MediaSource.isTypeSupported(videoType)) {
          throw new Error(`当前环境不支持 ${videoType}`);
        }
        if (!MediaSource.isTypeSupported(audioType)) {
          throw new Error(`当前环境不支持 ${audioType}`);
        }
        const videoSb = mediaSource.addSourceBuffer(videoType);
        const audioSb = mediaSource.addSourceBuffer(audioType);
        videoSb.mode = "segments";
        audioSb.mode = "segments";

        const videoInit = parseRange(dash.video.initRange);
        const audioInit = parseRange(dash.audio.initRange);
        const videoIndex = parseRange(dash.video.indexRange);
        const audioIndex = parseRange(dash.audio.indexRange);
        if (!videoInit || !audioInit || !videoIndex || !audioIndex) {
          throw new Error("DASH SegmentBase 范围无效");
        }

        const [vInit, aInit, vIdx, aIdx] = await Promise.all([
          fetchRange(dash.video, `${videoInit.start}-${videoInit.end}`),
          fetchRange(dash.audio, `${audioInit.start}-${audioInit.end}`),
          fetchRange(dash.video, `${videoIndex.start}-${videoIndex.end}`),
          fetchRange(dash.audio, `${audioIndex.start}-${audioIndex.end}`),
        ]);
        if (abort.signal.aborted || !video.isConnected) return;
        await appendBuffer(videoSb, vInit, abort.signal);
        await appendBuffer(audioSb, aInit, abort.signal);

        let videoFrags = parseSidx(toArrayBuffer(vIdx), videoIndex.start);
        let audioFrags = parseSidx(toArrayBuffer(aIdx), audioIndex.start);
        if (videoFrags.length === 0) {
          videoFrags = [
            {
              start: videoIndex.end + 1,
              end: 0x7fffffff,
              time: 0,
              duration: dash.duration || 1,
            },
          ];
        }
        if (audioFrags.length === 0) {
          audioFrags = [
            {
              start: audioIndex.end + 1,
              end: 0x7fffffff,
              time: 0,
              duration: dash.duration || 1,
            },
          ];
        }

        const videoDone = new Set<number>();
        const audioDone = new Set<number>();
        let filling = false;
        let seekEpoch = 0;

        const appendFrag = async (
          sb: SourceBuffer,
          track: BiliDashTrackInfo,
          frags: MediaFragment[],
          index: number,
          done: Set<number>,
        ) => {
          if (
            index < 0 ||
            index >= frags.length ||
            done.has(index) ||
            abort.signal.aborted
          ) {
            return;
          }
          const data = await fetchRange(track, rangeHeader(frags[index]));
          if (abort.signal.aborted || done.has(index)) return;
          await appendBuffer(sb, data, abort.signal);
          done.add(index);
        };

        const fill = async () => {
          if (filling || abort.signal.aborted || !video.isConnected) return;
          filling = true;
          const epoch = seekEpoch;
          try {
            const target = Math.max(0, video.currentTime);
            let vIdx = fragIndexAt(videoFrags, target);
            let aIdx = fragIndexAt(audioFrags, target);
            let added = 0;
            while (added < 8 && epoch === seekEpoch && !abort.signal.aborted) {
              if (hasTime(video, target) && aheadAt(video, target) >= 12) {
                break;
              }
              const needVideo =
                vIdx < videoFrags.length && !videoDone.has(vIdx);
              const needAudio =
                aIdx < audioFrags.length && !audioDone.has(aIdx);
              if (!needVideo && !needAudio) {
                vIdx += 1;
                aIdx += 1;
                if (vIdx >= videoFrags.length && aIdx >= audioFrags.length) {
                  break;
                }
                continue;
              }
              await Promise.all([
                needVideo
                  ? appendFrag(videoSb, dash.video, videoFrags, vIdx, videoDone)
                  : Promise.resolve(),
                needAudio
                  ? appendFrag(audioSb, dash.audio, audioFrags, aIdx, audioDone)
                  : Promise.resolve(),
              ]);
              added += 1;
              vIdx += 1;
              aIdx += 1;
            }
          } catch (error) {
            if (abort.signal.aborted || epoch !== seekEpoch) return;
            const message =
              error instanceof Error ? error.message : "DASH 缓冲失败";
            console.warn("[BiliDesk][dash-mse]", message, error);
            onError(message);
          } finally {
            filling = false;
            if (epoch !== seekEpoch) {
              void fill();
              return;
            }
            const t = Math.max(0, video.currentTime);
            const idx = fragIndexAt(videoFrags, t);
            if (!hasTime(video, t) && !videoDone.has(idx)) {
              void fill();
            }
          }
        };

        await Promise.all([
          appendFrag(videoSb, dash.video, videoFrags, 0, videoDone),
          appendFrag(audioSb, dash.audio, audioFrags, 0, audioDone),
        ]);
        if (videoFrags.length > 1) {
          await Promise.all([
            appendFrag(videoSb, dash.video, videoFrags, 1, videoDone),
            appendFrag(audioSb, dash.audio, audioFrags, 1, audioDone),
          ]);
        }

        try {
          if (abort.signal.aborted || !video.isConnected) return;
          if (video.paused && video.currentTime > 0.05) return;
          await video.play();
        } catch {
          // 浏览器可能拦截自动播放，交给 Artplayer 处理
        }

        const onTimeUpdate = () => {
          void fill();
        };
        const onSeeking = () => {
          seekEpoch += 1;
          void fill();
        };
        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("waiting", onTimeUpdate);
        video.addEventListener("seeking", onSeeking);
        video.addEventListener("seeked", onTimeUpdate);
        abort.signal.addEventListener(
          "abort",
          () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("waiting", onTimeUpdate);
            video.removeEventListener("seeking", onSeeking);
            video.removeEventListener("seeked", onTimeUpdate);
            try {
              if (videoSb.updating) videoSb.abort();
            } catch {
              // ignore
            }
            try {
              if (audioSb.updating) audioSb.abort();
            } catch {
              // ignore
            }
          },
          { once: true },
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "DASH 播放失败";
        console.warn("[BiliDesk][dash-mse]", message, error);
        onError(message);
      }
    })();
  };

  mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });

  return () => {
    abort.abort();
    stopMediaElement(video);
    try {
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
    } catch {
      // ignore
    }
    URL.revokeObjectURL(objectUrl);
  };
}
