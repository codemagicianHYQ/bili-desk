import { SEEK_STEP_OPTIONS, eventToChord, isModalOpen, isShortcutCapturing, isTypingTarget, readShortcutConfig, writeShortcutConfig, } from "@/lib/shortcuts";
/** 两次快进/快退间隔不超过该值才累加；停顿后再按从单次步长重新计 */
const SEEK_CHAIN_GAP_MS = 1000;
const SEEK_HINT_HOLD_MS = 1000;
const SEEK_HINT_FADE_MS = 220;
function seekHintHtml(seconds, forward) {
    return forward
        ? `<span class="bili-seek-hint-sec">+${seconds}秒</span><span class="bili-seek-hint-icon">»</span>`
        : `<span class="bili-seek-hint-icon">«</span><span class="bili-seek-hint-sec">-${seconds}秒</span>`;
}
function createSeekHintController() {
    let forward = true;
    let total = 0;
    let lastAt = 0;
    let hint = null;
    let hideTimer = 0;
    let fadeTimer = 0;
    const clearTimers = () => {
        if (hideTimer)
            window.clearTimeout(hideTimer);
        if (fadeTimer)
            window.clearTimeout(fadeTimer);
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
        show(art, step, nextForward) {
            const host = art.template.$player;
            if (!host)
                return;
            const now = Date.now();
            const chained = hint != null &&
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
export function attachPlayerHotkeys(art, isEnabled = () => true) {
    const seekHint = createSeekHintController();
    let pendingTarget = null;
    let pendingForward = null;
    let pendingAt = 0;
    let commitTimer = 0;
    const commitSeek = () => {
        commitTimer = 0;
        if (pendingTarget == null)
            return;
        art.emit("bili-keyboard-commit", pendingTarget);
    };
    const scheduleCommit = () => {
        if (commitTimer)
            window.clearTimeout(commitTimer);
        // 长按期间只推进度条。松手或停顿后再跳转，避免每次按键都让弹幕重排
        commitTimer = window.setTimeout(commitSeek, 220);
    };
    const onKeyDown = (event) => {
        if (!isEnabled())
            return;
        if (isShortcutCapturing())
            return;
        if (isTypingTarget(event.target))
            return;
        if (isModalOpen())
            return;
        if (art.setting?.show)
            return;
        const chord = eventToChord(event);
        if (!chord)
            return;
        const config = readShortcutConfig();
        const action = Object.entries(config.keys).find(([, bound]) => bound === chord)?.[0];
        if (!action || action === "goBack" || action === "goForward")
            return;
        if (event.repeat && action !== "seekBackward" && action !== "seekForward") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const video = art.video;
        if (!video)
            return;
        if (action === "seekBackward" || action === "seekForward") {
            const step = config.seekStep;
            const forward = action === "seekForward";
            const now = Date.now();
            const mediaTime = art.currentTime || 0;
            const chained = pendingTarget != null &&
                pendingForward === forward &&
                now - pendingAt <= SEEK_CHAIN_GAP_MS;
            const seekStillPending = pendingTarget != null &&
                Math.abs(mediaTime - pendingTarget) > 0.8 &&
                now - pendingAt <= 2500;
            const base = chained || seekStillPending ? pendingTarget : mediaTime;
            const duration = art.duration || video.duration || 0;
            const next = forward
                ? duration > 0
                    ? Math.min(duration, base + step)
                    : base + step
                : Math.max(0, base - step);
            pendingTarget = next;
            pendingForward = forward;
            pendingAt = now;
            art.emit("bili-keyboard-seek", next);
            seekHint.show(art, step, forward);
            scheduleCommit();
            return;
        }
        if (action === "playPause") {
            if (art.playing)
                art.pause();
            else
                void art.play();
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
    const onKeyUp = (event) => {
        if (pendingTarget == null)
            return;
        const chord = eventToChord(event);
        if (!chord)
            return;
        const keys = readShortcutConfig().keys;
        if (chord !== keys.seekBackward && chord !== keys.seekForward)
            return;
        if (commitTimer)
            window.clearTimeout(commitTimer);
        commitSeek();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
        if (commitTimer)
            window.clearTimeout(commitTimer);
        seekHint.dispose();
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("keyup", onKeyUp, true);
    };
}
export function createSeekStepSetting() {
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
            const seconds = Number(item.seconds);
            if (!Number.isFinite(seconds))
                return `${current} 秒`;
            const config = readShortcutConfig();
            writeShortcutConfig({ ...config, seekStep: seconds });
            return `${seconds} 秒`;
        },
    };
}
