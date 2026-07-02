import { app, BrowserWindow, session } from "electron";
import { createMainWindow } from "./window";
import { registerAllIpc } from "./ipc";
import { initDb } from "./db";

// Chromium 在视频解码器初始化/探测时可能输出无害的 ffmpeg_common 日志（播放正常时可忽略）
if (!app.isPackaged) {
  app.commandLine.appendSwitch("log-level", "3");
}

let mainWindow: BrowserWindow | null = null;
app.whenReady().then(() => {
  const mediaUrls = [
    "*://*.bilibili.com/*",
    "*://*.hdslb.com/*",
    "*://*.bilivideo.com/*",
    "*://*.bilivideo.cn/*",
    "*://*.mcdn.bilivideo.cn/*",
  ];

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: mediaUrls },
    (details, callback) => {
      details.requestHeaders.Referer = "https://www.bilibili.com/";
      details.requestHeaders.Origin = "https://www.bilibili.com";
      if (!details.requestHeaders["User-Agent"]) {
        details.requestHeaders["User-Agent"] =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  initDb();
  registerAllIpc();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
