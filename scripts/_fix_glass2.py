# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/renderer/src/styles/index.css"
text = p.read_text(encoding="utf-8")
marker = "/*\n * 液态玻璃"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("marker not found")

new = r"""/*
 * 液态玻璃 = 主题定制弹窗同款磨砂
 * - 系统 Acrylic 透桌面（Electron transparent + acrylic）
 * - 主区必须接近全透明，否则会变成死灰盖住壁纸
 * - 侧栏/顶栏/弹窗：同 ThemeCustomizer（低填充 + 强 blur）
 */
@keyframes bili-glass-drift {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(1.2%, -0.8%, 0) scale(1.03);
  }
}

html[data-theme-preset="glass"] {
  /* 对标 ThemeCustomizer：bg-card/40 + 强饱和模糊 */
  --glass-blur: 24px;
  --glass-sat: 2;
  --glass-bright: 1.1;
  --glass-fill: rgb(255 255 255 / 0.1);
  --glass-fill-dark: rgb(255 255 255 / 0.06);
  --glass-rim: rgb(255 255 255 / 0.5);
  --glass-rim-soft: rgb(255 255 255 / 0.18);
  --glass-border: rgb(255 255 255 / 0.36);
  --glass-border-dark: rgb(255 255 255 / 0.16);
  --glass-shadow: 0 12px 40px rgb(20 40 80 / 0.1);
  --glass-shadow-dark: 0 16px 48px rgb(0 0 0 / 0.32);
}

/* 整窗挖空：让 Acrylic / 壁纸透上来，禁止任何实色灰底 */
html[data-theme-preset="glass"],
html[data-theme-preset="glass"] body,
html[data-theme-preset="glass"] #root {
  background: transparent !important;
  background-color: transparent !important;
}

html[data-theme-preset="glass"] body {
  font-family:
    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui,
    sans-serif;
}

html[data-theme-preset="glass"] #root {
  position: relative;
  min-height: 100%;
}

html[data-theme-preset="glass"] #root > * {
  position: relative;
  z-index: 1;
}

/* 极淡色晕，alpha 必须很低 */
html[data-theme-preset="glass"] #root::before,
html[data-theme-preset="glass"] #root::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

html[data-theme-preset="glass"]:not(.dark) #root::before {
  background:
    radial-gradient(
      48rem 36rem at 6% -8%,
      rgb(255 140 200 / 0.12),
      transparent 62%
    ),
    radial-gradient(
      44rem 34rem at 98% 6%,
      rgb(80 160 255 / 0.1),
      transparent 60%
    );
  animation: bili-glass-drift 30s ease-in-out infinite;
}

html[data-theme-preset="glass"].dark #root::before {
  background:
    radial-gradient(
      46rem 34rem at 4% -4%,
      rgb(56 150 255 / 0.1),
      transparent 60%
    ),
    radial-gradient(
      42rem 32rem at 98% 8%,
      rgb(160 110 255 / 0.08),
      transparent 60%
    );
  animation: bili-glass-drift 34s ease-in-out infinite;
}

html[data-theme-preset="glass"] #root::after {
  opacity: 0.025;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: reduce) {
  html[data-theme-preset="glass"] #root::before {
    animation: none;
  }
}

/* 不要用高不透明白/灰盖死 Acrylic —— 和弹窗一样透 */
html[data-theme-preset="glass"]:not(.dark) [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.06) !important;
}

html[data-theme-preset="glass"].dark [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.04) !important;
}

html[data-theme-preset="glass"]:not(.dark) [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.14) !important;
  border-color: rgb(255 255 255 / 0.3);
}

html[data-theme-preset="glass"].dark [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.07) !important;
  border-color: rgb(255 255 255 / 0.12);
}

html[data-theme-preset="glass"]:not(.dark) .bg-secondary,
html[data-theme-preset="glass"]:not(.dark) .bg-muted {
  background-color: rgb(255 255 255 / 0.1) !important;
}

html[data-theme-preset="glass"].dark .bg-secondary,
html[data-theme-preset="glass"].dark .bg-muted {
  background-color: rgb(255 255 255 / 0.06) !important;
}

html[data-theme-preset="glass"]:not(.dark) .border-border {
  border-color: rgb(255 255 255 / 0.3);
}

html[data-theme-preset="glass"].dark .border-border {
  border-color: rgb(255 255 255 / 0.12);
}

html[data-theme-preset="glass"] [data-app-shell] {
  position: relative;
  gap: 0.55rem;
  padding: 0.55rem;
  background: transparent !important;
}

html[data-theme-preset="glass"] [data-app-sidebar] {
  position: relative !important;
  inset: auto !important;
  left: auto !important;
  top: auto !important;
  bottom: auto !important;
  z-index: 20;
  width: 14rem !important;
  flex: 0 0 14rem;
  align-self: stretch;
  border-radius: 1.45rem;
  border: 1px solid var(--glass-border) !important;
  overflow: hidden;
}

html[data-theme-preset="glass"].dark [data-app-sidebar] {
  border-color: var(--glass-border-dark) !important;
}

html[data-theme-preset="glass"] [data-app-sidebar] a[class*="bg-primary/10"] {
  background-color: rgb(255 255 255 / 0.18) !important;
  color: hsl(var(--foreground)) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3);
}

html[data-theme-preset="glass"].dark
  [data-app-sidebar]
  a[class*="bg-primary/10"] {
  background-color: rgb(255 255 255 / 0.12) !important;
}

html[data-theme-preset="glass"] [data-app-column] {
  position: relative;
  display: flex;
  width: auto;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.55rem;
  background: transparent !important;
}

html[data-theme-preset="glass"] [data-app-topbar] {
  position: relative !important;
  inset: auto !important;
  left: auto !important;
  right: auto !important;
  top: auto !important;
  z-index: 20;
  height: 3.4rem;
  width: 100%;
  flex: 0 0 auto;
  overflow: visible;
  border-radius: 1.35rem;
  border: 1px solid var(--glass-border) !important;
}

html[data-theme-preset="glass"].dark [data-app-topbar] {
  border-color: var(--glass-border-dark) !important;
}

/*
 * 主区：接近全透明（这是灰底的根因）
 * 卡片之间直接透 Acrylic/壁纸，效果才像主题弹窗
 */
html[data-theme-preset="glass"] [data-app-main] {
  position: relative;
  z-index: 0;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  border-radius: 1.35rem;
  border: 1px solid var(--glass-border);
  background: rgb(255 255 255 / 0.04) !important;
  box-shadow: inset 0 1px 0 var(--glass-rim);
}

html[data-theme-preset="glass"].dark [data-app-main] {
  border-color: var(--glass-border-dark);
  background: rgb(255 255 255 / 0.03) !important;
}

html[data-theme-preset="glass"] [data-app-main] > * {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0 !important;
  background: transparent !important;
}

/* 侧栏 / 顶栏 / 弹窗：与 ThemeCustomizer 同一配方 */
html[data-theme-preset="glass"] [data-app-chrome],
html[data-theme-preset="glass"] .bili-glass,
html[data-theme-preset="glass"] [data-glass-panel] {
  background: var(--glass-fill) !important;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright)) !important;
  box-shadow:
    inset 0 1px 0 var(--glass-rim),
    inset 0 0 0 0.5px var(--glass-rim-soft),
    var(--glass-shadow);
}

html[data-theme-preset="glass"].dark [data-app-chrome],
html[data-theme-preset="glass"].dark .bili-glass,
html[data-theme-preset="glass"].dark [data-glass-panel] {
  background: var(--glass-fill-dark) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    inset 0 0 0 0.5px rgb(255 255 255 / 0.1),
    var(--glass-shadow-dark);
}

html[data-theme-preset="glass"] [data-glass-panel] {
  border-color: var(--glass-border) !important;
}

html[data-theme-preset="glass"].dark [data-glass-panel] {
  border-color: var(--glass-border-dark) !important;
}

html[data-theme-preset="glass"] [data-glass-panel] [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.08) !important;
}

html[data-theme-preset="glass"] .bili-glass-scrim,
html[data-theme-preset="glass"] [data-glass-scrim] {
  background: rgb(8 12 22 / 0.14) !important;
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
}

html[data-theme-preset="glass"]:not(.dark) .bili-glass-scrim,
html[data-theme-preset="glass"]:not(.dark) [data-glass-scrim] {
  background: rgb(40 60 110 / 0.08) !important;
}

/* 视频卡片略实一点，保证可读；缝隙仍透壁纸 */
html[data-theme-preset="glass"] .rounded-xl.border.bg-card,
html[data-theme-preset="glass"] article.bg-card,
html[data-theme-preset="glass"] .group.bg-card {
  background: rgb(255 255 255 / 0.16) !important;
  border-color: rgb(255 255 255 / 0.26) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    0 8px 22px rgb(20 30 60 / 0.08);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}

html[data-theme-preset="glass"].dark .rounded-xl.border.bg-card,
html[data-theme-preset="glass"].dark article.bg-card,
html[data-theme-preset="glass"].dark .group.bg-card {
  background: rgb(255 255 255 / 0.08) !important;
  border-color: rgb(255 255 255 / 0.12) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.12),
    0 10px 26px rgb(0 0 0 / 0.2);
}

html[data-theme-preset="glass"] .bili-cmt-node {
  --cmt-chip: rgb(255 255 255 / 0.12);
}

html[data-theme-preset="glass"] .bili-cmt-fold {
  background: rgb(255 255 255 / 0.12);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

html[data-theme-preset="glass"].dark .bili-cmt-fold {
  background: rgb(255 255 255 / 0.08);
}

html[data-theme-preset="glass"] .bili-cmt-avatar {
  background: transparent;
}

html[data-theme-preset="glass"] .sticky.backdrop-blur-md,
html[data-theme-preset="glass"] .sticky.backdrop-blur,
html[data-theme-preset="glass"] [data-page-chrome] {
  background: var(--glass-fill) !important;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright)) !important;
  border-color: var(--glass-border) !important;
  box-shadow: inset 0 1px 0 var(--glass-rim);
}

html[data-theme-preset="glass"].dark .sticky.backdrop-blur-md,
html[data-theme-preset="glass"].dark .sticky.backdrop-blur,
html[data-theme-preset="glass"].dark [data-page-chrome] {
  background: var(--glass-fill-dark) !important;
  border-color: var(--glass-border-dark) !important;
}
"""

p.write_text(text[:idx] + new, encoding="utf-8")
print("ok")
