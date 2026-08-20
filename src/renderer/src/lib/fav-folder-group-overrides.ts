import type { FavFolderGroupOverrides } from "@shared/utils/fav-folder-groups";

const STORAGE_KEY = "bili-desk:fav-folder-group-overrides";

export function loadFavFolderGroupOverrides(): FavFolderGroupOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const next: FavFolderGroupOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function saveFavFolderGroupOverrides(
  overrides: FavFolderGroupOverrides,
): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
