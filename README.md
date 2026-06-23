# BiliDesk

B 站 Windows 第三方桌面客户端原型 — 基于 **Electron + React + TypeScript**。

## 核心差异化

- **收藏夹二级分类**：在 B 站官方单层收藏夹之上，本地 SQLite 维护一级/二级分类树
- **关注 UP 智能分组**：支持 AI 自动分类 + 关键词规则引擎
- **简洁美感 UI**：shadcn/ui + Tailwind，深色/浅色双主题

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 34 + electron-vite |
| 前端 | React 18 + React Router + Zustand |
| UI | TailwindCSS + shadcn/ui + Lucide |
| 主进程 | axios（B 站 API）、electron-store（配置 + 本地分类 JSON 持久化） |
| AI | OpenAI 兼容 API（DeepSeek / OpenAI / Ollama） |

## 架构

```
Renderer (React)  ──IPC──>  Preload  ──>  Main Process
                                              ├── BiliApiService (WBI + Cookie)
                                              ├── TaxonomyRepository (SQLite)
                                              ├── AiService + ClassifyEngine
                                              └── electron-store
```

B 站 API 请求全部在主进程发起，规避 CORS 并集中管理登录态。

## 参考项目

- [BiliCard](https://github.com/WEP-56/BIliCard) — Electron + React 架构、主进程网络层
- [Bili.Copilot](https://github.com/Richasy/Bili.Copilot) — 模块化 kernel、AI 集成思路
- [BiliPai](https://github.com/jay3-yy/BiliPai) — Feature 模块化、Clean Architecture
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) — API 文档

## 开发

```bash
# 环境要求：Node.js 20+、Windows 10/11

cd D:\Develop\bili-desk
npm install
npm run dev
```

## 打包

```bash
npm run build      # 构建
npm run dist:win   # Windows 安装包（输出到 release/）
```

## 路由

| 路径 | 功能 |
|------|------|
| `#/` | 推荐首页 |
| `#/favorites` | 收藏夹 + 本地二级分类 |
| `#/following` | 关注 UP + 分组 |
| `#/login` | 扫码登录 |
| `#/settings` | 主题、AI 配置 |

## Phase 2 Roadmap

- 收藏视频拖拽/批量移动到二级分类
- AI 批量分类进度与结果确认
- 可视化规则编辑器
- 播放器（Artplayer / MPV）、弹幕、下载

## License

MIT
