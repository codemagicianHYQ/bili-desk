import { BILI_AUTO_QN, isVipQuality, isVipQualityBlocked, shortQualityLabel, vipQualityBlockedNotice, } from "@shared/utils/bilibili-quality";
function qualityItemHtml(item, playInfo) {
    const vip = Boolean(item.needVip ?? isVipQuality(item.qn));
    const trialLeft = playInfo.isVip || !vip ? null : (playInfo.trialRemaining ?? null);
    const badge = vip && !playInfo.isVip && trialLeft != null && trialLeft > 0
        ? `<span class="bili-qn-trial">剩余${trialLeft}次</span>`
        : vip
            ? `<span class="bili-qn-badge">大会员</span>`
            : "";
    return `<span class="bili-qn-item${vip ? " is-vip" : ""}" data-qn="${item.qn}"><span class="bili-qn-name">${item.label}</span>${badge}</span>`;
}
function restoreQualitySelectorCurrent($item, currentQn) {
    const panel = $item.parentElement;
    if (!panel)
        return;
    panel.querySelectorAll(".art-selector-item").forEach((el) => {
        const qn = Number(el.querySelector("[data-qn]")?.getAttribute("data-qn"));
        el.classList.toggle("art-current", Number.isFinite(qn) && qn === currentQn);
    });
}
export function createQualityControl(playInfo, selectedQn, onChange) {
    const isAuto = selectedQn === BILI_AUTO_QN;
    const qualities = playInfo.qualities.length
        ? playInfo.qualities
        : [{ qn: playInfo.quality, label: playInfo.qualityLabel }];
    const currentQn = isAuto ? BILI_AUTO_QN : playInfo.quality;
    const privilege = {
        isVip: Boolean(playInfo.isVip),
        trialAble: Boolean(playInfo.trialAble),
        trialRemaining: playInfo.trialRemaining ?? null,
    };
    const selector = [
        ...qualities.map((item) => ({
            html: qualityItemHtml(item, playInfo),
            qn: item.qn,
            needVip: Boolean(item.needVip ?? isVipQuality(item.qn)),
            default: !isAuto && item.qn === playInfo.quality,
        })),
        {
            html: `<span class="bili-qn-item" data-qn="${BILI_AUTO_QN}"><span class="bili-qn-name">自动</span></span>`,
            qn: BILI_AUTO_QN,
            needVip: false,
            default: isAuto,
        },
    ];
    return {
        name: "quality",
        position: "right",
        index: 36,
        html: `<div class="bili-quality-btn">${isAuto ? "自动" : shortQualityLabel(playInfo.quality, playInfo.qualityLabel)}</div>`,
        tooltip: "清晰度",
        selector,
        mounted(element) {
            element.classList.add("bili-quality-control");
        },
        onSelect(item, $item) {
            const qn = Number(item.qn);
            if (!Number.isFinite(qn))
                return item.html;
            const needVip = Boolean(item.needVip);
            if (qn !== BILI_AUTO_QN &&
                needVip &&
                !playInfo.isVip &&
                isVipQualityBlocked(privilege)) {
                this.notice.show = vipQualityBlockedNotice(qn);
                restoreQualitySelectorCurrent($item, currentQn);
                return `<div class="bili-quality-btn">${isAuto ? "自动" : shortQualityLabel(playInfo.quality, playInfo.qualityLabel)}</div>`;
            }
            const label = qn === BILI_AUTO_QN ? "自动" : shortQualityLabel(qn);
            if (qn !== selectedQn)
                onChange(qn);
            return `<div class="bili-quality-btn">${label}</div>`;
        },
    };
}
