import { writePlaybackRate } from "@/components/video/playback-pref";
const PRESETS = [0.5, 0.8, 1, 1.3, 1.5, 2];
const MIN_RATE = 0.25;
const MAX_RATE = 3;
const DIAL_SIZE = 132;
const DIAL_RADIUS = 52;
const KNOB_RADIUS = 7;
const SNAP_THRESHOLD = 0.07;
const TICK_INNER = DIAL_RADIUS - 10;
const TICK_OUTER = DIAL_RADIUS + 6;
function clampRate(rate) {
    return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}
function formatRate(rate) {
    return rate === 1 ? "正常" : `${rate.toFixed(2).replace(/\.?0+$/, "")}x`;
}
function formatSpeedLabel(rate) {
    if (rate === 1)
        return "1.0X";
    return `${rate.toFixed(1).replace(/\.0$/, "")}X`;
}
function rateToAngle(rate) {
    const ratio = (clampRate(rate) - MIN_RATE) / (MAX_RATE - MIN_RATE);
    return -135 + ratio * 270;
}
function angleToRate(angle) {
    const clamped = Math.min(135, Math.max(-135, angle));
    const ratio = (clamped + 135) / 270;
    const rate = MIN_RATE + ratio * (MAX_RATE - MIN_RATE);
    return Math.round(rate * 100) / 100;
}
function pointerToAngle(clientX, clientY, rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rad = Math.atan2(clientY - cy, clientX - cx);
    let deg = (rad * 180) / Math.PI + 90;
    if (deg > 180)
        deg -= 360;
    return deg;
}
function pointOnDial(angleDeg, radius) {
    const angle = (angleDeg * Math.PI) / 180;
    return {
        x: DIAL_SIZE / 2 + Math.sin(angle) * radius,
        y: DIAL_SIZE / 2 - Math.cos(angle) * radius,
    };
}
function knobPosition(rate) {
    return pointOnDial(rateToAngle(rate), DIAL_RADIUS);
}
function buildTickMarks() {
    return PRESETS.map((rate) => {
        const angle = rateToAngle(rate);
        const inner = pointOnDial(angle, TICK_INNER);
        const outer = pointOnDial(angle, TICK_OUTER);
        return `<line class="bili-rate-tick" data-tick="${rate}" x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" />`;
    }).join("");
}
function snapToPreset(rate) {
    let best = null;
    let bestDist = SNAP_THRESHOLD;
    for (const preset of PRESETS) {
        const dist = Math.abs(preset - rate);
        if (dist <= bestDist) {
            bestDist = dist;
            best = preset;
        }
    }
    return best != null ? { rate: best, snapped: best } : { rate, snapped: null };
}
function triggerSnapFeedback(panel, snapped) {
    try {
        navigator.vibrate?.(12);
    }
    catch {
        // desktop / unsupported
    }
    const tick = panel.querySelector(`.bili-rate-tick[data-tick="${snapped}"]`);
    const knob = panel.querySelector(".bili-rate-knob");
    tick?.classList.remove("is-snap");
    knob?.classList.remove("is-snap");
    // restart animation
    void tick?.getBoundingClientRect();
    void knob?.getBoundingClientRect();
    tick?.classList.add("is-snap");
    knob?.classList.add("is-snap");
    window.setTimeout(() => {
        tick?.classList.remove("is-snap");
        knob?.classList.remove("is-snap");
    }, 180);
}
function applyRate(art, rate) {
    const next = clampRate(rate);
    art.playbackRate = next;
    writePlaybackRate(next);
}
function updatePresetActive(panel, rate) {
    panel
        .querySelectorAll("[data-preset]")
        .forEach((button) => {
        const preset = Number(button.dataset.preset);
        button.classList.toggle("is-active", Math.abs(preset - rate) < 0.001);
    });
    panel.querySelectorAll(".bili-rate-tick").forEach((tick) => {
        const preset = Number(tick.dataset.tick);
        tick.classList.toggle("is-active", Math.abs(preset - rate) < 0.001);
    });
}
function updateDial(panel, rate) {
    const knob = panel.querySelector(".bili-rate-knob");
    if (!knob)
        return;
    const { x, y } = knobPosition(rate);
    knob.setAttribute("cx", String(x));
    knob.setAttribute("cy", String(y));
    const label = panel.querySelector(".bili-rate-value");
    if (label)
        label.textContent = formatRate(rate);
}
function updateSpeedButton(controlEl, rate) {
    const label = controlEl.querySelector(".bili-speed-btn");
    if (label)
        label.textContent = formatSpeedLabel(rate);
}
function mountPlaybackRatePanel(art, panel) {
    panel.innerHTML = `
    <div class="bili-rate-panel">
      <div class="bili-rate-dial-wrap">
        <svg class="bili-rate-dial" width="${DIAL_SIZE}" height="${DIAL_SIZE}" viewBox="0 0 ${DIAL_SIZE} ${DIAL_SIZE}">
          <circle class="bili-rate-track" cx="${DIAL_SIZE / 2}" cy="${DIAL_SIZE / 2}" r="${DIAL_RADIUS}" />
          <g class="bili-rate-ticks">${buildTickMarks()}</g>
          <circle class="bili-rate-knob" cx="${DIAL_SIZE / 2}" cy="${DIAL_SIZE / 2 - DIAL_RADIUS}" r="${KNOB_RADIUS}" />
        </svg>
        <div class="bili-rate-value">${formatRate(art.playbackRate)}</div>
        <div class="bili-rate-hint">拖动圆盘微调 · 靠近刻度自动吸附</div>
      </div>
      <div class="bili-rate-presets">
        ${PRESETS.map((rate) => `<button type="button" class="bili-rate-preset" data-preset="${rate}">${rate === 1 ? "正常" : rate.toFixed(1)}</button>`).join("")}
      </div>
    </div>
  `;
    updateDial(panel, art.playbackRate);
    updatePresetActive(panel, art.playbackRate);
    panel
        .querySelectorAll("[data-preset]")
        .forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const rate = Number(button.dataset.preset);
            applyRate(art, rate);
            updateDial(panel, rate);
            updatePresetActive(panel, rate);
            triggerSnapFeedback(panel, rate);
        });
    });
    const dial = panel.querySelector(".bili-rate-dial");
    if (!dial)
        return;
    let dragging = false;
    let lastSnapped = null;
    const handlePointer = (clientX, clientY) => {
        const rect = dial.getBoundingClientRect();
        const angle = pointerToAngle(clientX, clientY, rect);
        const raw = angleToRate(angle);
        const { rate, snapped } = snapToPreset(raw);
        applyRate(art, rate);
        updateDial(panel, rate);
        updatePresetActive(panel, rate);
        if (snapped != null && snapped !== lastSnapped) {
            triggerSnapFeedback(panel, snapped);
        }
        lastSnapped = snapped;
    };
    dial.addEventListener("pointerdown", (event) => {
        dragging = true;
        lastSnapped = null;
        dial.setPointerCapture(event.pointerId);
        handlePointer(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });
    dial.addEventListener("pointermove", (event) => {
        if (!dragging)
            return;
        handlePointer(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });
    dial.addEventListener("pointerup", (event) => {
        dragging = false;
        lastSnapped = null;
        dial.releasePointerCapture(event.pointerId);
        event.stopPropagation();
    });
}
export function createPlaybackRateControl() {
    let panelEl = null;
    let controlEl = null;
    const hidePanel = () => {
        if (panelEl)
            panelEl.style.display = "none";
    };
    const togglePanel = () => {
        if (!panelEl)
            return;
        panelEl.style.display = panelEl.style.display === "none" ? "block" : "none";
    };
    return {
        name: "playback-rate",
        position: "right",
        index: 38,
        html: '<div class="bili-speed-btn">1.0X</div>',
        tooltip: "播放速度",
        mounted(element) {
            controlEl = element;
            element.classList.add("bili-speed-control");
            panelEl = document.createElement("div");
            panelEl.className = "bili-speed-panel";
            panelEl.style.display = "none";
            mountPlaybackRatePanel(this, panelEl);
            element.appendChild(panelEl);
            updateSpeedButton(element, this.playbackRate);
            this.on("video:ratechange", () => {
                if (controlEl)
                    updateSpeedButton(controlEl, this.playbackRate);
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
