import { BILI_AUTO_QN } from "@shared/utils/bilibili-quality";
const STORAGE_KEY = "bilidesk:video-qn";
export function readQualityPref() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null)
            return BILI_AUTO_QN;
        const qn = Number(raw);
        return Number.isFinite(qn) ? qn : BILI_AUTO_QN;
    }
    catch {
        return BILI_AUTO_QN;
    }
}
export function writeQualityPref(qn) {
    try {
        localStorage.setItem(STORAGE_KEY, String(qn));
    }
    catch {
        // ignore quota / private mode
    }
}
