import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";
import type { VideoSubtitleTrack } from "@shared/types";
import {
  matchSubtitleTrack,
  readSubtitleScope,
  rememberSubtitleChoice,
  resolveSubtitleChoice,
  setSubtitleScope,
  trackLanKey,
  type SubtitleChoice,
} from "@/components/video/subtitle-pref";

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
  show = true,
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
  art.subtitle.show = show;
}

function currentChoice(bvid: string, fallbackLan: string): SubtitleChoice {
  const choice = resolveSubtitleChoice(bvid);
  return {
    enabled: choice.enabled,
    lan: choice.lan || fallbackLan,
  };
}

/** 控制栏右侧「字幕」：关闭 / 各语种轨 / 作用范围 */
export function createSubtitleControl(
  tracks: VideoSubtitleTrack[],
  trackUrls: Map<number, string>,
  bvid: string,
): ComponentOption {
  const choice = resolveSubtitleChoice(bvid);
  const preferred = matchSubtitleTrack(tracks, choice, pickSubtitleTrack);
  const shown = choice.enabled && Boolean(preferred);
  const scope = readSubtitleScope();
  const selector = [
    {
      html: "关闭",
      off: true,
      default: !shown,
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
        lan: trackLanKey(track),
        trackId: track.id,
        default: shown && preferred?.id === track.id,
      };
    }),
    {
      html: scope === "current" ? "✓ 仅当前视频" : "仅当前视频",
      scope: "current" as const,
    },
    {
      html: scope === "all" ? "✓ 应用到所有视频" : "应用到所有视频",
      scope: "all" as const,
    },
  ];

  const buttonLabel = shown
    ? preferred?.lanDoc || preferred?.lan || "字幕"
    : "关";

  return {
    name: "bili-subtitle",
    position: "right",
    index: 34,
    html: `<div class="bili-subtitle-btn">${buttonLabel}</div>`,
    selector,
    mounted(this: Artplayer, element) {
      element.classList.add("bili-subtitle-control");
    },
    onSelect(item) {
      if (item.scope === "current" || item.scope === "all") {
        const active = preferred
          ? currentChoice(bvid, trackLanKey(preferred))
          : resolveSubtitleChoice(bvid);
        active.enabled = this.subtitle.show !== false && Boolean(preferred);
        setSubtitleScope(item.scope, bvid, active);
        return this.subtitle.show ? buttonLabel : "关";
      }
      if (item.off) {
        rememberSubtitleChoice(bvid, {
          enabled: false,
          lan: preferred ? trackLanKey(preferred) : choice.lan,
        });
        this.subtitle.show = false;
        return "关";
      }
      const url = String(item.url ?? "");
      const lan = String(item.lan ?? item.html ?? "");
      if (!url) return "字幕";
      rememberSubtitleChoice(bvid, { enabled: true, lan });
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
