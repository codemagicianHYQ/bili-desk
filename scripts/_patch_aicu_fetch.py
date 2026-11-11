# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src/main/services/aicu-api.ts"
text = path.read_text(encoding="utf-8")
start = text.index("/** 只打开官网一次做人机验证")
end = text.index("/** Electron 进程常带奇怪的 NO_PROXY")

new = r'''async function clearStaleClearanceCookies(): Promise<void> {
  try {
    const ses = aicuSession();
    const old = await ses.cookies.get({});
    for (const cookie of old) {
      if (!String(cookie.domain || "").includes("aicu")) continue;
      if (cookie.name !== "cf_clearance") continue;
      const cookieUrl = `https://${String(cookie.domain || "").replace(/^\./, "")}/`;
      await ses.cookies.remove(cookieUrl, cookie.name);
    }
  } catch {
    // ignore
  }
}

async function ensureBridgeWindow(show: boolean): Promise<BrowserWindow> {
  const proxy = resolveProxyUrl();
  const ses = aicuSession();
  if (proxy) {
    await ses.setProxy({
      proxyRules: proxy.replace(/^https?:\/\//i, ""),
    });
  }

  let win = bridge && !bridge.isDestroyed() ? bridge : null;
  if (!win) {
    if (!interactiveChallengeUsed) {
      await clearStaleClearanceCookies();
      interactiveChallengeUsed = true;
    }
    const ua = aicuUserAgent();
    win = new BrowserWindow({
      show,
      width: 920,
      height: 680,
      title: "AICU 同步（勾选真人后等到出现 JSON）",
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTITION,
        preload: ensureStealthPreload(),
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    bridge = win;
    win.on("closed", () => {
      if (bridge === win) bridge = null;
    });
    win.webContents.setUserAgent(ua);
  }

  if (show && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.focus();
  }
  return win;
}

/** 等窗口正文变成 AICU JSON；不要在验证中途狂注入 DOM */
async function waitForJsonBody(
  win: BrowserWindow,
  targetUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  const started = Date.now();
  let hinted = false;
  let reloadedAfterCookie = false;
  const ua = aicuUserAgent();

  while (Date.now() - started < timeoutMs) {
    if (win.isDestroyed()) return null;
    const json = await bodyLooksLikeAicuJson(win);
    if (json) {
      cachedNavJson = { url: targetUrl, text: json };
      return json;
    }

    const text = await readBridgeBody(win).catch(() => "");
    const challenged =
      looksLikeCfChallenge(text) || /请验证您是真人|正在验证/i.test(text);

    if (challenged && !hinted) {
      hinted = true;
      challengeListener?.(
        "waiting",
        "请勾选「请验证您是真人」，等到页面变成 JSON 文本后会自动继续",
      );
      await win.webContents
        .executeJavaScript(
          `(() => {
            if (document.getElementById("bilidesk-aicu-hint")) return;
            const tip = document.createElement("div");
            tip.id = "bilidesk-aicu-hint";
            tip.style.cssText = "position:fixed;z-index:2147483646;left:12px;right:12px;bottom:12px;padding:10px 12px;border-radius:10px;background:#0f172acc;color:#e2e8f0;font:13px/1.45 sans-serif;pointer-events:none";
            tip.textContent = "勾选「请验证您是真人」后请耐心等待。成功后本页会变成 JSON（{\\"code\\":0...}），应用会自动继续，不要关窗。";
            document.documentElement.appendChild(tip);
          })()`,
        )
        .catch(() => undefined);
    }

    if ((await readClearanceCookie()) && !reloadedAfterCookie && challenged) {
      reloadedAfterCookie = true;
      challengeListener?.("waiting", "验证 cookie 已写入，正在刷新获取 JSON…");
      await win
        .loadURL(targetUrl, { userAgent: ua, httpReferrer: HOME })
        .catch(() => undefined);
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return null;
}

function urlsMatchApi(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.origin !== ub.origin || ua.pathname !== ub.pathname) return false;
    const keys = new Set([
      ...ua.searchParams.keys(),
      ...ub.searchParams.keys(),
    ]);
    for (const key of keys) {
      if (ua.searchParams.get(key) !== ub.searchParams.get(key)) return false;
    }
    return true;
  } catch {
    return a === b;
  }
}

/**
 * 核心拉取：验证窗打开的就是目标接口 URL。
 * 成功时正文 JSON 直接当成本次结果，禁止「验完再 loadURL」导致二次拦截。
 */
async function fetchViaVisibleBrowser(url: string): Promise<FetchResult> {
  try {
    if (cachedNavJson && urlsMatchApi(cachedNavJson.url, url)) {
      const text = cachedNavJson.text;
      cachedNavJson = null;
      browserSessionReady = true;
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      if (bridge && !bridge.isDestroyed() && bridge.isVisible()) bridge.hide();
      return { status: 200, text, via: "page-cache" };
    }

    const win = await ensureBridgeWindow(false);

    if (urlsMatchApi(win.webContents.getURL(), url)) {
      const existing = await bodyLooksLikeAicuJson(win);
      if (existing) {
        browserSessionReady = true;
        clearanceOkUntil = Date.now() + 25 * 60 * 1000;
        if (win.isVisible()) win.hide();
        return { status: 200, text: existing, via: "page-current" };
      }
    }

    if (browserSessionReady) {
      const xhr = await fetchViaInPageXhr(url);
      if (isGoodJson(xhr)) return xhr;

      if (win.isVisible()) win.hide();
      await win.loadURL(url, {
        userAgent: aicuUserAgent(),
        httpReferrer: HOME,
      });
      const silentDeadline = Date.now() + 10_000;
      while (Date.now() < silentDeadline) {
        if (win.isDestroyed()) break;
        const json = await bodyLooksLikeAicuJson(win);
        if (json) {
          return { status: 200, text: json, via: "page-silent" };
        }
        const body = await readBridgeBody(win);
        if (looksLikeCfChallenge(body)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    challengeListener?.(
      "open",
      "需要人机验证：请勾选「请验证您是真人」，等到出现 JSON",
    );
    challengePromptCount += 1;
    if (!win.isVisible()) win.show();
    win.focus();
    await win.loadURL(url, {
      userAgent: aicuUserAgent(),
      httpReferrer: HOME,
    });

    const json = await waitForJsonBody(win, url, 300_000);
    if (json) {
      forceBrowserOnly = true;
      browserSessionReady = true;
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      cachedNavJson = null;
      if (!win.isDestroyed()) win.hide();
      challengeListener?.("done", "本页数据已拿到，继续同步…");
      await writeDebug(
        `aicu page ok via=visible uid=${challengeUid || "-"} bytes=${json.length}`,
      );
      return { status: 200, text: json, via: "page-visible" };
    }

    challengeListener?.("fail", "等待 JSON 超时，请重试同步");
    return {
      status: 403,
      text: "",
      via: "page-visible",
      detail: "等待人机验证后的 JSON 超时",
    };
  } catch (error) {
    return {
      status: 0,
      text: "",
      via: "page-visible",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function aicuFetch(url: string): Promise<FetchResult> {
  if (forceBrowserOnly || Date.now() < clearanceOkUntil) {
    const page = await fetchViaVisibleBrowser(url);
    await writeDebug(
      `url=${url} proxy=${resolveProxyUrl() || "-"} forceBrowser=true | ${page.via}:${page.status}${page.detail ? `(${page.detail})` : ""}`,
    );
    return page;
  }

  const viaCurl = await fetchViaCurl(url);
  if (isGoodJson(viaCurl)) return viaCurl;

  if (viaCurl.status === 403 || looksLikeCfChallenge(viaCurl.text)) {
    forceBrowserOnly = true;
    const page = await fetchViaVisibleBrowser(url);
    await writeDebug(
      `url=${url} proxy=${resolveProxyUrl() || "-"} forceBrowser=true | curl:403 | ${page.via}:${page.status}${page.detail ? `(${page.detail})` : ""}`,
    );
    return page;
  }

  const viaSession = await fetchViaNet(url);
  if (isGoodJson(viaSession)) return viaSession;

  await writeDebug(
    `url=${url} proxy=${resolveProxyUrl() || "-"} | curl:${viaCurl.status} | session:${viaSession.status}`,
  );
  return viaSession.status > 0 ? viaSession : viaCurl;
}

'''

# Also remove old fetchViaPageNavigate + duplicate urlsMatchApi later
text2 = text[:start] + new + text[end:]
# Remove duplicate urlsMatchApi + fetchViaPageNavigate block if still present
marker = "function urlsMatchApi(a: string, b: string): boolean {"
first = text2.find(marker)
second = text2.find(marker, first + 1)
if second != -1:
    # remove from second urlsMatchApi through end of fetchViaPageNavigate
    nav_end = text2.find("async function aicuGet(", second)
    if nav_end != -1:
        text2 = text2[:second] + text2[nav_end:]
        print("removed duplicate urlsMatchApi/fetchViaPageNavigate")

old_err = "请重新点同步：勾选真人后点「继续同步」即可，之后应自动翻页不再弹窗。"
new_err = "请重新点同步：弹出窗口里勾选「请验证您是真人」，等到页面变成 JSON 后会自动继续。"
if old_err in text2:
    text2 = text2.replace(old_err, new_err)
    print("updated error message")

path.write_text(text2, encoding="utf-8")
print("ok", path)
