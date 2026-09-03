import { normalizeBiliImage } from "@/lib/bili-image";

const FORBIDDEN_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "style",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
  "video",
  "audio",
  "source",
  "track",
  "base",
]);

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "img",
  "figure",
  "figcaption",
  "a",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "small",
]);

const STYLE_ALLOW = new Set([
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-align",
  "text-indent",
  "line-height",
  "margin",
  "margin-top",
  "margin-bottom",
  "padding",
  "width",
  "max-width",
  "height",
]);

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function safeHref(raw: string): string {
  const href = raw.trim();
  if (!href) return "";
  const lower = href.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return "";
  }
  if (href.startsWith("//")) return `https:${href}`;
  return href;
}

function rewriteImg(el: Element): void {
  const src =
    el.getAttribute("data-src") ||
    el.getAttribute("data-original") ||
    el.getAttribute("src") ||
    "";
  const url = normalizeBiliImage(src);
  for (const name of Array.from(el.getAttributeNames())) {
    el.removeAttribute(name);
  }
  if (url) {
    el.setAttribute("src", url);
    el.setAttribute("referrerpolicy", "no-referrer");
    el.setAttribute("loading", "lazy");
  }
}

function sanitizeStyle(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return "";
      const key = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();
      if (!STYLE_ALLOW.has(key)) return "";
      if (/url\s*\(|expression|javascript/i.test(value)) return "";
      return `${key}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");
}

function stripAttrs(el: Element, tag: string): void {
  for (const name of Array.from(el.getAttributeNames())) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || lower === "srcdoc") {
      el.removeAttribute(name);
      continue;
    }
    if (tag === "img") continue;
    if (tag === "a" && lower === "href") {
      const href = safeHref(el.getAttribute("href") || "");
      if (href) el.setAttribute("href", href);
      else el.removeAttribute("href");
      continue;
    }
    if (lower === "style") {
      const next = sanitizeStyle(el.getAttribute("style") || "");
      if (next) el.setAttribute("style", next);
      else el.removeAttribute("style");
      continue;
    }
    if (lower === "class" || lower === "colspan" || lower === "rowspan") {
      continue;
    }
    if (lower === "alt" || lower === "title") continue;
    el.removeAttribute(name);
  }
}

function clean(el: Element): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const node = child as Element;
    const tag = node.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      node.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      clean(node);
      unwrap(node);
      continue;
    }
    if (tag === "img") rewriteImg(node);
    else stripAttrs(node, tag);
    clean(node);
  }
}

export function sanitizeArticleHtml(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(
    `<div id="bili-article-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("bili-article-root");
  if (!root) return "";
  clean(root);
  return root.innerHTML;
}
