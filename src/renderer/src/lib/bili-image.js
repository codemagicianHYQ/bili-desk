export function normalizeBiliImage(url) {
    if (!url)
        return "";
    if (url.startsWith("//"))
        return `https:${url}`;
    if (url.startsWith("http://"))
        return url.replace(/^http:/, "https:");
    if (url.startsWith("https://"))
        return url;
    if (url.startsWith("/"))
        return `https://i0.hdslb.com${url}`;
    return `https://${url}`;
}
export function normalizeVideoCover(url) {
    const base = normalizeBiliImage(url);
    if (!base)
        return "";
    if (base.includes("@"))
        return base;
    return `${base}@672w_378h_1c.webp`;
}
