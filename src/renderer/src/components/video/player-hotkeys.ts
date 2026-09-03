import type Artplayer from "artplayer";
import type { Setting } from "artplayer/types/setting";
import {
  SEEK_STEP_OPTIONS,
  eventToChord,
  isShortcutCapturing,
  isTypingTarget,
  readShortcutConfig,
  type ShortcutAction,
  writeShortcutConfig,
} from "@/lib/shortcuts";

/** 两次快进/快退间隔不超过该值才累加；停顿后再按从单次步长重新计 */
const SEEK_CHAIN_GAP_MS = 1000;
const SEEK_HINT_HOLD_MS = 1000;
const SEEK_HINT_FADE_MS = 220;

function seekHintHtml(seconds: number, forward: boolean) {
  return forward
    ? `<span class="bili-seek-hint-sec">+${seconds}秒</span><span class="bili-seek-hint-icon">»</span>`
    : `<span class="bili-seek-hint-icon">«</span><span class="bili-seek-hint-sec">-${seconds}秒</span>`;
}

function createSeekHintController() {
  let forward = true;
  let total = 0;
  let lastAt = 0;
  let hint: HTMLElement | null = null;
  let hideTimer = 0;
  let fadeTimer = 0;

  const clearTimers = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    if (fadeTimer) window.clearTimeout(fadeTimer);
    hideTimer = 0;
    fadeTimer = 0;
  };

  const removeHint = () => {
    clearTimers();
    hint?.remove();
    hint = null;
  };

  const scheduleHide = () => {
    clearTimers();
    hideTimer = window.setTimeout(() => {
      hint?.classList.remove("is-show");
      fadeTimer = window.setTimeout(removeHint, SEEK_HINT_FADE_MS);
    }, SEEK_HINT_HOLD_MS);
  };

  return {
    show(art: Artplayer, step: number, nextForward: boolean) {
      const host = art.template.$player as HTMLElement | undefined;
      if (!host) return;
      const now = Date.now();
      const chained =
        hint != null &&
        forward === nextForward &&
        now - lastAt <= SEEK_CHAIN_GAP_MS;
      total = chained ? total + step : step;
      forward = nextForward;
      lastAt = now;

      if (!hint || !host.contains(hint) || !chained) {
        hint?.remove();
        hint = document.createElement("div");
        hint.className = `bili-seek-hint ${forward ? "is-forward" : "is-back"}`;
        host.appendChild(hint);
        window.requestAnimationFrame(() => hint?.classList.add("is-show"));
      }
      hint.innerHTML = seekHintHtml(total, forward);
      hint.classList.toggle("is-forward", forward);
      hint.classList.toggle("is-back", !forward);
      hint.classList.add("is-show");
      scheduleHide();
    },
    dispose: removeHint,
  };
}

export function attachPlayerHotkeys(
  art: Artplayer,
  isEnabled: () => boolean = () => true,
): () => void {
  const seekHint = createSeekHintController();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEnabled()) return;
    if (isShortcutCapturing()) return;
    if (isTypingTarget(event.target)) return;
    if (art.setting?.show) return;
    const chord = eventToChord(event);
    if (!chord) return;

    const config = readShortcutConfig();
    const action = (
      Object.entries(config.keys) as Array<[ShortcutAction, string]>
    ).find(([, bound]) => bound === chord)?.[0];
    if (!action) return;
    if (event.repeat && action !== "seekBackward" && action !== "seekForward") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const video = art.video as HTMLVideoElement | undefined;
    if (!video) return;

    if (action === "seekBackward" || action === "seekForward") {
      const step = config.seekStep;
      const duration = art.duration || video.duration || 0;
      art.currentTime =
        action === "seekForward"
          ? Math.min(duration, art.currentTime + step)
          : Math.max(0, art.currentTime - step);
      seekHint.show(art, step, action === "seekForward");
      return;
    }
    if (action === "playPause") {
      if (art.playing) art.pause();
      else void art.play();
      return;
    }
    if (action === "volumeUp") {
      art.volume = Math.min(1, (art.volume ?? 0) + 0.1);
      return;
    }
    if (action === "volumeDown") {
      art.volume = Math.max(0, (art.volume ?? 0) - 0.1);
      return;
    }
    if (action === "mute") {
      art.muted = !art.muted;
      return;
    }
    if (action === "fullscreen") {
      art.emit("bili-toggle-fullscreen");
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    seekHint.dispose();
    document.removeEventListener("keydown", onKeyDown, true);
  };
}

export function createSeekStepSetting(): Setting {
  const current = readShortcutConfig().seekStep;
  return {
    html: "快捷键 · 快进快退",
    tooltip: `${current} 秒`,
    width: 180,
    selector: SEEK_STEP_OPTIONS.map((seconds) => ({
      html: `${seconds} 秒`,
      seconds,
      default: seconds === current,
    })),
    onSelect(item) {
      const seconds = Number((item as { seconds?: number }).seconds);
      if (!Number.isFinite(seconds)) return `${current} 秒`;
      const config = readShortcutConfig();
      writeShortcutConfig({ ...config, seekStep: seconds });
      return `${seconds} 秒`;
    },
  };
}
