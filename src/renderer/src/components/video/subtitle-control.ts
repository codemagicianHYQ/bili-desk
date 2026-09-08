import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";
import type { VideoSubtitleTrack } from "@shared/types";

const SUBTITLE_STYLE = {
  color: "#fff",
  fontSize: "20px",
  textShadow: "0 1px 2px rgba(0,0,0,.85)",
} as const;

export function pickSubtitleTrack(
  tracks: VideoSubtitleTrack[] | undefined,
): VideoSubtitleTrack | undefined {
  if (!tracks || tracks.length === 0) return undefined;
  return (
    tracks.find((track) =>
      /zh|中文|ai-zh|zh-Hans|zh-CN/i.test(`${track.lan} ${track.lanDoc}`),
    ) ?? tracks[0]
  );
}

export function createSubtitleBlobUrl(vtt: string): string {
  return URL.createObjectURL(
    new Blob([vtt], { type: "text/vtt;charset=utf-8" }),
  );
}

export async function applyArtSubtitle(
  art: Artplayer,
  track: VideoSubtitleTrack,
  blobUrl: string,
): Promise<void> {
  const option = {
    url: blobUrl,
    type: "vtt",
    encoding: "utf-8",
    escape: true,
    name: track.lanDoc || track.lan || "字幕",
    style: { ...SUBTITLE_STYLE },
  };
  try {
    if (art.subtitle.url) {
      await art.subtitle.switch(blobUrl, option);
    } else {
      await art.subtitle.init(option);
    }
  } catch {
    await art.subtitle.init(option);
  }
  art.subtitle.show = true;
}

/** 控制栏右侧「字幕」：关闭 / 各语种轨 */
export function createSubtitleControl(
  tracks: VideoSubtitleTrack[],
  trackUrls: Map<number, string>,
): ComponentOption {
  const preferred = pickSubtitleTrack(tracks);
  const selector = [
    {
      html: "关闭",
      off: true,
      default: false,
    },
    ...tracks.map((track) => {
      let url = trackUrls.get(track.id);
      if (!url) {
        url = createSubtitleBlobUrl(track.vtt);
        trackUrls.set(track.id, url);
      }
      return {
        html: track.lanDoc || track.lan || `字幕 ${track.id}`,
        url,
        trackId: track.id,
        default: preferred?.id === track.id,
      };
    }),
  ];

  return {
    name: "bili-subtitle",
    position: "right",
    index: 34,
    html: `<div class="bili-subtitle-btn">字幕</div>`,
    selector,
    mounted(this: Artplayer, element) {
      element.classList.add("bili-subtitle-control");
    },
    onSelect(item) {
      if (item.off) {
        this.subtitle.show = false;
        return "关";
      }
      const url = String(item.url ?? "");
      if (!url) return "字幕";
      void this.subtitle
        .switch(url, {
          type: "vtt",
          encoding: "utf-8",
          escape: true,
          name: String(item.html),
          style: { ...SUBTITLE_STYLE },
        })
        .then(() => {
          this.subtitle.show = true;
        })
        .catch(() => {
          void this.subtitle.init({
            url,
            type: "vtt",
            encoding: "utf-8",
            escape: true,
            name: String(item.html),
            style: { ...SUBTITLE_STYLE },
          });
          this.subtitle.show = true;
        });
      return String(item.html);
    },
  };
}
