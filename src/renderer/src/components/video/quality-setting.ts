import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";
import type { VideoPlayInfo } from "@shared/types";
import { BILI_AUTO_QN } from "@shared/utils/bilibili-quality";

export function createQualityControl(
  playInfo: VideoPlayInfo,
  selectedQn: number,
  onChange: (qn: number) => void,
): ComponentOption {
  const isAuto = selectedQn === BILI_AUTO_QN;
  const qualities = playInfo.qualities.length
    ? playInfo.qualities
    : [{ qn: playInfo.quality, label: playInfo.qualityLabel }];

  const selector = [
    ...qualities.map((item) => ({
      html: item.label,
      qn: item.qn,
      default: !isAuto && item.qn === playInfo.quality,
    })),
    {
      html: "自动",
      qn: BILI_AUTO_QN,
      default: isAuto,
    },
  ];

  return {
    name: "quality",
    position: "right",
    index: 36,
    html: `<div class="bili-quality-btn">${isAuto ? "自动" : playInfo.qualityLabel}</div>`,
    tooltip: "清晰度",
    selector,
    mounted(this: Artplayer, element) {
      element.classList.add("bili-quality-control");
    },
    onSelect(item) {
      const qn = Number((item as { qn?: number }).qn);
      if (!Number.isFinite(qn)) return item.html;
      if (qn === selectedQn) return item.html;
      onChange(qn);
      return item.html;
    },
  };
}
