# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/renderer/src/styles/index.css"
text = p.read_text(encoding="utf-8")
marker = "/*\n * 液态玻璃"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("marker not found")

new = r"""/*
 * 液态玻璃（对标 ThemeCustomizer 弹窗）
 * 1) 侧栏/顶栏占位浮动，绝不盖住正文
 * 2) 整页半透：壳、主区、卡片都透彩色氛围底，不是只糊一层侧栏
 * 3) body 不透明封窗，透的是应用内渐变，不是桌面
 */
@keyframes bili-glass-drift {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(2%, -1.6%, 0) scale(1.05);
  }
}

html[data-theme-preset="glass"] {
  --glass-blur: 36px;
  --glass-sat: 2.2;
  --glass-bright: 1.12;
  --glass-fill: rgb(255 255 255 / 0.16);
  --glass-fill-dark: rgb(255 255 255 / 0.09);
  --glass-panel: rgb(255 255 255 / 0.1);
  --glass-panel-dark: rgb(255 255 255 / 0.06);
  --glass-rim: rgb(255 255 255 / 0.58);
  --glass-rim-soft: rgb(255 255 255 / 0.22);
  --glass-border: rgb(255 255 255 / 0.42);
  --glass-border-dark: rgb(255 255 255 / 0.18);
  --glass-shadow: 0 14px 40px rgb(30 50 110 / 0.16);
  --glass-shadow-dark: 0 16px 44px rgb(0 0 0 / 0.4);
  --glass-base: #b9cef2;
  --glass-base-dark: #0a0e1a;
}

html[data-theme-preset="glass"]:not(.dark) {
  background-color: var(--glass-base);
}

html[data-theme-preset="glass"].dark {
  background-color: var(--glass-base-dark);
}

html[data-theme-preset="glass"] body {
  font-family:
    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui,
    sans-serif;
  background-color: var(--glass-base) !important;
}

html[data-theme-preset="glass"].dark body {
  background-color: var(--glass-base-dark) !important;
}

html[data-theme-preset="glass"] #root {
  position: relative;
  isolation: isolate;
  background: transparent;
  min-height: 100%;
}

html[data-theme-preset="glass"] #root > * {
  position: relative;
  z-index: 1;
}

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
      58rem 46rem at 4% -10%,
      rgb(255 110 170 / 0.98),
      transparent 58%
    ),
    radial-gradient(
      54rem 44rem at 100% 0%,
      rgb(64 150 255 / 0.98),
      transparent 55%
    ),
    radial-gradient(
      50rem 42rem at 80% 110%,
      rgb(160 110 255 / 0.85),
      transparent 58%
    ),
    radial-gradient(
      42rem 36rem at 10% 100%,
      rgb(255 180 90 / 0.8),
      transparent 62%
    ),
    linear-gradient(160deg, #a8c4f0 0%, #ceb8eb 46%, #b4daf5 100%);
  animation: bili-glass-drift 26s ease-in-out infinite;
}

html[data-theme-preset="glass"].dark #root::before {
  background:
    radial-gradient(
      54rem 42rem at 0% -8%,
      rgb(56 150 255 / 0.85),
      transparent 55%
    ),
    radial-gradient(
      50rem 40rem at 100% 4%,
      rgb(170 110 255 / 0.75),
      transparent 56%
    ),
    radial-gradient(
      46rem 38rem at 70% 110%,
      rgb(244 114 182 / 0.55),
      transparent 58%
    ),
    radial-gradient(
      40rem 32rem at 30% 60%,
      rgb(34 211 238 / 0.42),
      transparent 60%
    ),
    linear-gradient(168deg, #060914 0%, #141c30 48%, #080d18 100%);
  animation: bili-glass-drift 30s ease-in-out infinite;
}

html[data-theme-preset="glass"] #root::after {
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: reduce) {
  html[data-theme-preset="glass"] #root::before {
    animation: none;
  }
}

/* —— 整体半透：背景/卡片都让氛围色透上来 —— */
html[data-theme-preset="glass"]:not(.dark) [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.12) !important;
}

html[data-theme-preset="glass"].dark [class*="bg-background"] {
  background-color: rgb(255 255 255 / 0.05) !important;
}

html[data-theme-preset="glass"]:not(.dark) [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.22) !important;
  border-color: rgb(255 255 255 / 0.35);
}

html[data-theme-preset="glass"].dark [class*="bg-card"] {
  background-color: rgb(255 255 255 / 0.08) !important;
  border-color: rgb(255 255 255 / 0.14);
}

html[data-theme-preset="glass"]:not(.dark) .bg-secondary,
html[data-theme-preset="glass"]:not(.dark) .bg-muted {
  background-color: rgb(255 255 255 / 0.16) !important;
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

/* —— 布局：flex 占位 + 缝隙，侧栏绝不叠在正文上 —— */
html[data-theme-preset="glass"] [data-app-shell] {
  position: relative;
  gap: 0.55rem;
  padding: 0.55rem;
  background: transparent;
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
  background: transparent;
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

/* 主内容整块也是玻璃面板 = 整体透明 */
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
    brightness(var(--glass-bright)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat))
    brightness(var(--glass-bright)) !important;
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
}

/* 侧栏 / 顶栏 / 弹窗：同 ThemeCustomizer */
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
    inset 0 0 0 0.5px rgb(255 255 255 / 0.12),
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
  background: rgb(8 12 22 / 0.2) !important;
  backdrop-filter: blur(14px) saturate(1.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.6);
}

html[data-theme-preset="glass"]:not(.dark) .bili-glass-scrim,
html[data-theme-preset="glass"]:not(.dark) [data-glass-scrim] {
  background: rgb(40 60 110 / 0.12) !important;
}

/* 列表卡片：半透磨砂，封面仍清晰 */
html[data-theme-preset="glass"] .rounded-xl.border.bg-card,
html[data-theme-preset="glass"] article.bg-card,
html[data-theme-preset="glass"] .group.bg-card {
  background: rgb(255 255 255 / 0.14) !important;
  border-color: rgb(255 255 255 / 0.26) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    0 8px 22px rgb(20 30 60 / 0.1);
  backdrop-filter: blur(18px) saturate(1.7);
  -webkit-backdrop-filter: blur(18px) saturate(1.7);
}

html[data-theme-preset="glass"].dark .rounded-xl.border.bg-card,
html[data-theme-preset="glass"].dark article.bg-card,
html[data-theme-preset="glass"].dark .group.bg-card {
  background: rgb(255 255 255 / 0.07) !important;
  border-color: rgb(255 255 255 / 0.12) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.12),
    0 10px 26px rgb(0 0 0 / 0.24);
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
print("fixed glass css")
