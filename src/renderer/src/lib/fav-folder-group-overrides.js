const STORAGE_KEY = "bili-desk:fav-folder-group-overrides";
export function loadFavFolderGroupOverrides() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        const next = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" && value)
                next[key] = value;
        }
        return next;
    }
    catch {
        return {};
    }
}
export function saveFavFolderGroupOverrides(overrides) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
