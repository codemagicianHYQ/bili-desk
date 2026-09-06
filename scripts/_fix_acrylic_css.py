# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/renderer/src/styles/index.css"
text = p.read_text(encoding="utf-8")
marker = "/*\n * 液态玻璃"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("marker not found")

new = r"""/*
 * 液态玻璃 = 系统 Acrylic + CSS 半透
 * 真正「透桌面壁纸」靠 Electron transparent + backgroundMaterial:acrylic
 * 这里只负责：别再用实色把桌面糊死；侧栏占位不挡内容
 */
@keyframes bili-glass-drift {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(1.6%, -1.2%, 0) scale(1.04);
  }
}

html[data-theme-preset="glass"] {
  --glass-blur: 28px;
  --glass-sat: 1.85;
  --glass-bright: 1.08;
  --glass-fill: rgb(255 255 255 / 0.22);
  --glass-fill-dark: rgb(20 24 40 / 0.28);
  --glass-panel: rgb(255 255 255 / 0.14);
  --glass-panel-dark: rgb(12 16 28 / 0.22);
  --glass-rim: rgb(255 255 255 / 0.55);
  --glass-rim-soft: rgb(255 255 255 / 0.2);
  --glass-border: rgb(255 255 255 / 0.38);
  --glass-border-dark: rgb(255 255 255 / 0.16);
  --glass-shadow: 0 12px 36px rgb(20 40 80 / 0.12);
  --glass-shadow-dark: 0 14px 40px rgb(0 0 0 / 0.28);
}

/* 整窗挖空：让 Acrylic / 桌面壁纸透上来 */
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

/* 极淡色晕，不能用不透明底，否则壁纸被盖死 */
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
      50rem 40rem at 8% -6%,
      rgb(255 140 200 / 0.22),
      transparent 60%
    ),
    radial-gradient(
      48rem 38rem at 96% 8%,
      rgb(80 160 255 / 0.2),
      transparent 58%
    ),
    radial-gradient(
      44rem 36rem at 70% 110%,
      rgb(160 120 255 / 0.16),
      transparent 60%
    );
  animation: bili-glass-drift 28s ease-in-out infinite;
}

html[data-theme-preset="glass"].dark #root::before {
  background:
    radial-gradient(
      48rem 38rem at 4% -4%,
      rgb(56 150 255 / 0.18),
      transparent 58%
    ),
    radial-gradient(
      46rem 36rem at 98% 6%,
      rgb(160 110 255 / 0.16),
      transparent 58%
    ),
    radial-gradient(
      42rem 34rem at 72% 108%,
      rgb(244 114 182 / 0.12),
      transparent 60%
    );
  animation: bili-glass-drift 32s ease-in-out infinite;
}

html[data-theme-preset="glass"] #root::after {
  opacity: 0.03;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: reduce) {
  html[data-theme-preset="glass"] #root::before {
    animation: none;
  }
}

html[data-theme-preset="glass"]:not(.dark) [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.18) !important;
}

html[data-theme-preset="glass"].dark [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.06) !important;
}

html[data-theme-preset="glass"]:not(.dark) [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.28) !important;
  border-color: rgb(255 255 255 / 0.36);
}

html[data-theme-preset="glass"].dark [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.08) !important;
  border-color: rgb(255 255 255 / 0.14);
}

html[data-theme-preset="glass"]:not(.dark) .bg-secondary,
html[data-theme-preset="glass"]:not(.dark) .bg-muted {
  background-color: rgb(255 255 255 / 0.2) !important;
}

html[data-theme-preset="glass"].dark .bg-secondary,
html[data-theme-preset="glass"].dark .bg-muted {
  background-color: rgb(255 255 255 / 0.08) !important;
}

html[data-theme-preset="glass"]:not(.dark) .border-border {
  border-color: rgb(255 255 255 / 0.34);
}

html[data-theme-preset="glass"].dark .border-border {
  border-color: rgb(255 255 255 / 0.14);
}

/* flex 占位，侧栏不盖正文；缝隙里直接透壁纸 */
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
  background-color: rgb(255 255 255 / 0.22) !important;
  color: hsl(var(--foreground)) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35);
}

html[data-theme-preset="glass"].dark
  [data-app-sidebar]
  a[class*="bg-primary/10"] {
  background-color: rgb(255 255 255 / 0.14) !important;
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

html[data-theme-preset="glass"] [data-app-main] {
  position: relative;
  z-index: 0;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  border-radius: 1.35rem;
  border: 1px solid var(--glass-border);
  background: var(--glass-panel) !important;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright));
  box-shadow:
    inset 0 1px 0 var(--glass-rim),
    inset 0 0 0 0.5px var(--glass-rim-soft);
}

html[data-theme-preset="glass"].dark [data-app-main] {
  border-color: var(--glass-border-dark);
  background: var(--glass-panel-dark) !important;
}

html[data-theme-preset="glass"] [data-app-main] > * {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0 !important;
  background: transparent !important;
}

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
    inset 0 1px 0 rgb(255 255 255 / 0.26),
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
  background-color: rgb(255 255 255 / 0.1) !important;
}

html[data-theme-preset="glass"] .bili-glass-scrim,
html[data-theme-preset="glass"] [data-glass-scrim] {
  background: rgb(8 12 22 / 0.18) !important;
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
}

html[data-theme-preset="glass"]:not(.dark) .bili-glass-scrim,
html[data-theme-preset="glass"]:not(.dark) [data-glass-scrim] {
  background: rgb(40 60 110 / 0.1) !important;
}

html[data-theme-preset="glass"] .rounded-xl.border.bg-card,
html[data-theme-preset="glass"] article.bg-card,
html[data-theme-preset="glass"] .group.bg-card {
  background: rgb(255 255 255 / 0.2) !important;
  border-color: rgb(255 255 255 / 0.28) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.3),
    0 8px 22px rgb(20 30 60 / 0.08);
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
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
  --cmt-chip: rgb(255 255 255 / 0.14);
}

html[data-theme-preset="glass"] .bili-cmt-fold {
  background: rgb(255 255 255 / 0.14);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

html[data-theme-preset="glass"].dark .bili-cmt-fold {
  background: rgb(255 255 255 / 0.1);
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
print("ok acrylic css")
