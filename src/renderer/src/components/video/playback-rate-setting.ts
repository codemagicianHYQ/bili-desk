import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";

const PRESETS = [0.5, 0.8, 1, 1.3, 1.5, 2] as const;
const MIN_RATE = 0.25;
const MAX_RATE = 3;
const DIAL_SIZE = 132;
const DIAL_RADIUS = 52;
const KNOB_RADIUS = 7;

function clampRate(rate: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

function formatRate(rate: number): string {
  return rate === 1 ? "正常" : `${rate.toFixed(2).replace(/\.?0+$/, "")}x`;
}

function formatSpeedLabel(rate: number): string {
  if (rate === 1) return "1.0X";
  return `${rate.toFixed(1).replace(/\.0$/, "")}X`;
}

function rateToAngle(rate: number): number {
  const ratio = (clampRate(rate) - MIN_RATE) / (MAX_RATE - MIN_RATE);
  return -135 + ratio * 270;
}

function angleToRate(angle: number): number {
  const clamped = Math.min(135, Math.max(-135, angle));
  const ratio = (clamped + 135) / 270;
  const rate = MIN_RATE + ratio * (MAX_RATE - MIN_RATE);
  return Math.round(rate * 100) / 100;
}

function pointerToAngle(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rad = Math.atan2(clientY - cy, clientX - cx);
  let deg = (rad * 180) / Math.PI + 90;
  if (deg > 180) deg -= 360;
  return deg;
}

function knobPosition(rate: number): { x: number; y: number } {
  const angle = (rateToAngle(rate) * Math.PI) / 180;
  return {
    x: DIAL_SIZE / 2 + Math.sin(angle) * DIAL_RADIUS,
    y: DIAL_SIZE / 2 - Math.cos(angle) * DIAL_RADIUS,
  };
}

function applyRate(art: Artplayer, rate: number) {
  art.playbackRate = clampRate(rate);
}

function updatePresetActive(panel: HTMLElement, rate: number) {
  panel
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) => {
      const preset = Number(button.dataset.preset);
      button.classList.toggle("is-active", Math.abs(preset - rate) < 0.001);
    });
}

function updateDial(panel: HTMLElement, rate: number) {
  const knob = panel.querySelector<SVGCircleElement>(".bili-rate-knob");
  if (!knob) return;
  const { x, y } = knobPosition(rate);
  knob.setAttribute("cx", String(x));
  knob.setAttribute("cy", String(y));

  const label = panel.querySelector<HTMLElement>(".bili-rate-value");
  if (label) label.textContent = formatRate(rate);
}

function updateSpeedButton(controlEl: HTMLElement, rate: number) {
  const label = controlEl.querySelector<HTMLElement>(".bili-speed-btn");
  if (label) label.textContent = formatSpeedLabel(rate);
}

function mountPlaybackRatePanel(art: Artplayer, panel: HTMLDivElement) {
  panel.innerHTML = `
    <div class="bili-rate-panel">
      <div class="bili-rate-presets">
        ${PRESETS.map(
          (rate) =>
            `<button type="button" class="bili-rate-preset" data-preset="${rate}">${rate === 1 ? "正常" : rate.toFixed(1)}</button>`,
        ).join("")}
      </div>
      <div class="bili-rate-dial-wrap">
        <svg class="bili-rate-dial" width="${DIAL_SIZE}" height="${DIAL_SIZE}" viewBox="0 0 ${DIAL_SIZE} ${DIAL_SIZE}">
          <circle class="bili-rate-track" cx="${DIAL_SIZE / 2}" cy="${DIAL_SIZE / 2}" r="${DIAL_RADIUS}" />
          <circle class="bili-rate-knob" cx="${DIAL_SIZE / 2}" cy="${DIAL_SIZE / 2 - DIAL_RADIUS}" r="${KNOB_RADIUS}" />
        </svg>
        <div class="bili-rate-value">${formatRate(art.playbackRate)}</div>
        <div class="bili-rate-hint">拖动圆盘微调</div>
      </div>
    </div>
  `;

  updateDial(panel, art.playbackRate);
  updatePresetActive(panel, art.playbackRate);

  panel
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const rate = Number(button.dataset.preset);
        applyRate(art, rate);
        updateDial(panel, rate);
        updatePresetActive(panel, rate);
      });
    });

  const dial = panel.querySelector<SVGElement>(".bili-rate-dial");
  if (!dial) return;

  let dragging = false;

  const handlePointer = (clientX: number, clientY: number) => {
    const rect = dial.getBoundingClientRect();
    const angle = pointerToAngle(clientX, clientY, rect);
    const rate = angleToRate(angle);
    applyRate(art, rate);
    updateDial(panel, rate);
    updatePresetActive(panel, rate);
  };

  dial.addEventListener("pointerdown", (event) => {
    dragging = true;
    dial.setPointerCapture(event.pointerId);
    handlePointer(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  });

  dial.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    handlePointer(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  });

  dial.addEventListener("pointerup", (event) => {
    dragging = false;
    dial.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  });
}

export function createPlaybackRateControl(): ComponentOption {
  let panelEl: HTMLDivElement | null = null;
  let controlEl: HTMLElement | null = null;

  const hidePanel = () => {
    if (panelEl) panelEl.style.display = "none";
  };

  const togglePanel = () => {
    if (!panelEl) return;
    panelEl.style.display = panelEl.style.display === "none" ? "block" : "none";
  };

  return {
    name: "playback-rate",
    position: "right",
    index: 38,
    html: '<div class="bili-speed-btn">1.0X</div>',
    tooltip: "播放速度",
    mounted(this: Artplayer, element) {
      controlEl = element;
      element.classList.add("bili-speed-control");

      panelEl = document.createElement("div");
      panelEl.className = "bili-speed-panel";
      panelEl.style.display = "none";
      mountPlaybackRatePanel(this, panelEl);
      element.appendChild(panelEl);

      updateSpeedButton(element, this.playbackRate);

      this.on("video:ratechange", () => {
        if (controlEl) updateSpeedButton(controlEl, this.playbackRate);
        if (panelEl) {
          updateDial(panelEl, this.playbackRate);
          updatePresetActive(panelEl, this.playbackRate);
        }
      });

      this.on("blur", hidePanel);
    },
    click(_component, event) {
      event.stopPropagation();
      togglePanel();
    },
    beforeUnmount() {
      panelEl = null;
      controlEl = null;
    },
  };
}
