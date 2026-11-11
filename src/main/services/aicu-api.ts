import { execFile, execFileSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { appendFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { app, BrowserWindow, net, session } from "electron";
import type { FootprintItem } from "@shared/types";
import {
  closeAicuChrome,
  fetchAicuViaChrome,
  resetAicuChromeGate,
  setAicuChromeListener,
} from "./aicu-chrome";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://api.aicu.cc/api/v3";
const HOME = "https://www.aicu.cc/";
const PARTITION = "persist:aicu";
/** 必须跟 Electron 内嵌 Chromium 大版本一致，否则 Turnstile 会卡在「正在验证…」然后反复刷新 */
function aicuUserAgent(): string {
  const chrome = process.versions.chrome || "132.0.0.0";
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}
const REQUEST_GAP_MS = 900;
const SYSTEM_CURL = "C:\\Windows\\System32\\curl.exe";

function ensureStealthPreload(): string {
  const file = path.join(app.getPath("userData"), "aicu-stealth-preload.js");
  const source = `"use strict";
try {
  Object.defineProperty(navigator, "webdriver", {
    get: function () { return undefined; },
    configurable: true
  });
} catch (e) {}
`;
  try {
    writeFileSync(file, source, "utf8");
  } catch {
    // ignore
  }
  return file;
}

export interface AicuPageResult {
  items: FootprintItem[];
  isEnd: boolean;
  allCount: number;
}

interface FetchResult {
  status: number;
  text: string;
  via: string;
  detail?: string;
}

let lastRequestAt = 0;
let bridge: BrowserWindow | null = null;
/** 全进程同步周期内只弹一次验证窗；并发请求共用同一个 Promise */
let clearanceGate: Promise<boolean> | null = null;
let clearanceOkUntil = 0;
let interactiveChallengeUsed = false;
/** 一旦确认 CF 在拦，后续只走 Chromium（curl 带 cookie 无效） */
let forceBrowserOnly = false;
/** 浏览器会话已拿到过用户 JSON：后续只静默导航，绝不弹窗 */
let browserSessionReady = false;
/** 整次同步最多弹出人机验证窗口的次数 */
let challengePromptCount = 0;
const MAX_CHALLENGE_PROMPTS = 1;
/** 验证页直接打开真实 uid，避免「uid=1 过了、自己的号又拦」再弹第二次 */
let challengeUid = 0;
/** 验证成功时窗口里已有的第一页 JSON，避免立刻再 loadURL 触发 CF */
let cachedNavJson: { url: string; text: string } | null = null;

type ChallengeListener = (
  state: "open" | "waiting" | "done" | "fail",
  detail?: string,
) => void;
let challengeListener: ChallengeListener | null = null;

/** 每次点「同步历史」开头调用，允许再弹一次验证（仍不会连弹） */
export function resetAicuChallengeGate(uid = 0): void {
  interactiveChallengeUsed = false;
  clearanceGate = null;
  forceBrowserOnly = false;
  browserSessionReady = false;
  challengePromptCount = 0;
  challengeUid = uid > 0 ? uid : 0;
  cachedNavJson = null;
  visibleFetchChain = Promise.resolve();
  resetAicuChromeGate();
}

export function setAicuChallengeListener(
  listener: ChallengeListener | null,
): void {
  challengeListener = listener;
  setAicuChromeListener(listener);
}

export function closeAicuBridge(): void {
  if (bridge && !bridge.isDestroyed()) {
    try {
      bridge.destroy();
    } catch {
      // ignore
    }
  }
  bridge = null;
  clearanceGate = null;
  void closeAicuChrome();
}

function buildReplyProbeUrl(uid: number, ps = 1): string {
  const id = uid > 0 ? uid : 1;
  return `${BASE}/search/getreply?uid=${id}&pn=1&ps=${ps}&mode=0`;
}

async function readBridgeBody(win: BrowserWindow): Promise<string> {
  return String(
    (await win.webContents
      .executeJavaScript(
        `(() => {
          const pre = document.querySelector("pre");
          if (pre && pre.innerText) return pre.innerText;
          return document.body ? (document.body.innerText || document.body.textContent || "") : "";
        })()`,
      )
      .catch(() => "")) || "",
  ).trim();
}

async function bodyLooksLikeAicuJson(
  win: BrowserWindow,
): Promise<string | null> {
  const text = await readBridgeBody(win);
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as { code?: number };
    if (typeof parsed.code === "number") return text;
  } catch {
    return null;
  }
  return null;
}

async function probeAicuInWindow(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;
  // 优先看地址栏打开的正文（对用户 uid 比 page.fetch 更稳）
  if (await bodyLooksLikeAicuJson(win)) return true;
  const probeUrl = buildReplyProbeUrl(challengeUid || 1, 1);
  const probe = await win.webContents
    .executeJavaScript(
      `fetch(${JSON.stringify(probeUrl)}, {
        credentials: "include",
        headers: { Accept: "application/json", Referer: ${JSON.stringify(HOME)} }
      }).then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 120) }))
       .catch((e) => ({ status: 0, text: String(e) }))`,
    )
    .catch(() => null);
  return Boolean(
    probe && probe.status === 200 && String(probe.text || "").startsWith("{"),
  );
}
let cachedProxy: string | null | undefined;
let cachedPython: string | null | undefined;
let cachedScript: string | null | undefined;

let stealthRegistered = false;

function aicuSession() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(aicuUserAgent());
  // Turnstile 在 iframe 里跑，必须给所有 frame 注入，不能只 preload 顶层
  if (!stealthRegistered) {
    try {
      ses.registerPreloadScript({
        type: "frame",
        filePath: ensureStealthPreload(),
      });
      stealthRegistered = true;
    } catch {
      // 旧版 Electron 无此 API 时忽略
    }
  }
  return ses;
}

async function throttle(): Promise<void> {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

function resolveProxyUrl(): string | null {
  if (cachedProxy !== undefined) return cachedProxy;
  const fromEnv = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ]
    .map((value) => value?.trim())
    .find(Boolean);
  if (fromEnv) {
    cachedProxy = fromEnv;
    return cachedProxy;
  }

  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        [
          "query",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        ],
        { encoding: "utf8", windowsHide: true },
      );
      const enabled = /ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(out);
      const server =
        out.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)?.[1]?.trim() ?? "";
      if (enabled && server) {
        cachedProxy = server.includes("://") ? server : `http://${server}`;
        return cachedProxy;
      }
    } catch {
      // ignore
    }
  }

  cachedProxy = null;
  return null;
}

function resolvePython(): string | null {
  if (cachedPython !== undefined) return cachedPython;

  const candidates: string[] = [];
  const push = (value?: string | null) => {
    const next = value?.trim();
    if (next && !candidates.includes(next)) candidates.push(next);
  };

  push(process.env.PYTHON);
  push(process.env.PY);

  // GUI 启动的 Electron 往往没有终端 PATH，尽量用 where / 常见安装位
  try {
    const out = execFileSync("cmd.exe", ["/d", "/s", "/c", "where python"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    for (const line of out.split(/\r?\n/)) push(line);
  } catch {
    // ignore
  }

  const local = process.env.LOCALAPPDATA || "";
  const home = process.env.USERPROFILE || "";
  for (const root of [
    path.join(local, "Programs", "Python"),
    path.join(home, "AppData", "Local", "Programs", "Python"),
    "D:\\Tools\\veighna_studio",
    "C:\\Python312",
    "C:\\Python311",
    "C:\\Python310",
  ]) {
    if (!root || !existsSync(root)) continue;
    push(path.join(root, "python.exe"));
    try {
      for (const entry of execFileSync(
        "cmd.exe",
        ["/d", "/s", "/c", `dir /b /s "${root}\\python.exe"`],
        { encoding: "utf8", windowsHide: true, timeout: 8000 },
      ).split(/\r?\n/)) {
        push(entry);
      }
    } catch {
      // ignore
    }
  }

  push("python");
  push("py");

  for (const bin of candidates) {
    try {
      if (bin.endsWith(".exe") && !existsSync(bin)) continue;
      const args =
        bin.toLowerCase() === "py" ? ["-3", "--version"] : ["--version"];
      execFileSync(bin, args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
      cachedPython = bin;
      return cachedPython;
    } catch {
      // try next
    }
  }
  cachedPython = null;
  return null;
}

function resolveScript(): string | null {
  if (cachedScript !== undefined) return cachedScript;
  const candidates = [
    path.join(app.getAppPath(), "scripts", "aicu-fetch.py"),
    path.join(app.getAppPath(), "resources", "aicu-fetch.py"),
    path.join(process.cwd(), "scripts", "aicu-fetch.py"),
    path.join(process.cwd(), "resources", "aicu-fetch.py"),
    path.join(here, "../../scripts/aicu-fetch.py"),
    path.join(here, "../../../scripts/aicu-fetch.py"),
    path.join(here, "../../resources/aicu-fetch.py"),
    path.join(process.resourcesPath || "", "aicu-fetch.py"),
  ];
  for (const file of candidates) {
    if (file && existsSync(file)) {
      cachedScript = file;
      return cachedScript;
    }
  }
  cachedScript = null;
  return null;
}

async function writeDebug(line: string): Promise<void> {
  try {
    const file = path.join(app.getPath("userData"), "aicu-debug.log");
    await appendFile(file, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    // ignore
  }
}

function looksLikeCfChallenge(text: string): boolean {
  return /just a moment|cf-browser-verification|challenge-platform|请验证您是真人|正在进行安全验证/i.test(
    text,
  );
}

function isGoodJson(res: FetchResult): boolean {
  return (
    res.status >= 200 &&
    res.status < 300 &&
    !looksLikeCfChallenge(res.text) &&
    res.text.trim().startsWith("{")
  );
}

async function readClearanceCookie(): Promise<string | null> {
  const cookies = await aicuSession().cookies.get({});
  const hit = cookies.find(
    (cookie) =>
      cookie.name === "cf_clearance" &&
      String(cookie.domain || "").includes("aicu"),
  );
  return hit?.value || null;
}

async function clearStaleClearanceCookies(): Promise<void> {
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

/**
 * 等窗口正文变成 AICU JSON。
 * 铁律：等待期间禁止 loadURL / 禁止反复注入 DOM —— 那会把 Turnstile 打断成「点了又弹」。
 */
async function waitForJsonBody(
  win: BrowserWindow,
  targetUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  challengeListener?.(
    "waiting",
    "请勾选「请验证您是真人」，然后停手等待；不要连点，不要关窗",
  );

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        win.webContents.removeListener("did-finish-load", onLoaded);
      } catch {
        // ignore
      }
      clearInterval(timer);
      clearTimeout(timeout);
      resolve(value);
    };

    const checkOnce = async () => {
      if (settled || win.isDestroyed()) {
        finish(null);
        return;
      }
      const json = await bodyLooksLikeAicuJson(win);
      if (json) {
        cachedNavJson = { url: targetUrl, text: json };
        finish(json);
      }
    };

    const onLoaded = () => {
      void checkOnce();
    };

    win.webContents.on("did-finish-load", onLoaded);
    // 低频探测即可；高频 executeJavaScript 也会干扰 Turnstile
    const timer = setInterval(() => {
      void checkOnce();
    }, 2500);
    const timeout = setTimeout(() => finish(null), timeoutMs);

    win.once("closed", () => finish(null));
    void checkOnce();
  });
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

/** 串行化可见拉取，防止并发 loadURL 把验证框刷爆 */
let visibleFetchChain: Promise<unknown> = Promise.resolve();

/**
 * 核心拉取：验证窗打开的就是目标接口 URL。
 * 同一 URL 最多 loadURL 一次，然后干等 JSON；绝不再刷新。
 */
async function fetchViaVisibleBrowser(url: string): Promise<FetchResult> {
  const prev = visibleFetchChain;
  let release!: () => void;
  visibleFetchChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev.catch(() => undefined);

  try {
    if (cachedNavJson && urlsMatchApi(cachedNavJson.url, url)) {
      const text = cachedNavJson.text;
      cachedNavJson = null;
      browserSessionReady = true;
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      if (bridge && !bridge.isDestroyed() && bridge.isVisible()) bridge.hide();
      return { status: 200, text, via: "page-cache" };
    }

    const win = await ensureBridgeWindow(true);
    const alreadyOnUrl = urlsMatchApi(win.webContents.getURL(), url);

    if (alreadyOnUrl) {
      const existing = await bodyLooksLikeAicuJson(win);
      if (existing) {
        browserSessionReady = true;
        clearanceOkUntil = Date.now() + 25 * 60 * 1000;
        if (win.isVisible()) win.hide();
        return { status: 200, text: existing, via: "page-current" };
      }
    }

    // 已有会话时先试页内 fetch，不要先静默 loadURL（再亮窗又 load = 无限弹）
    if (browserSessionReady && !alreadyOnUrl) {
      const xhr = await fetchViaInPageXhr(url);
      if (isGoodJson(xhr)) return xhr;
    }

    challengeListener?.(
      "open",
      "请勾选「请验证您是真人」，点一次后停手等待页面变成 JSON",
    );
    challengePromptCount += 1;
    if (!win.isVisible()) win.show();

    // 已经在目标页（含挑战页）就不要再 loadURL，否则复选框会重置
    if (!alreadyOnUrl) {
      await win.loadURL(url, {
        userAgent: aicuUserAgent(),
        httpReferrer: HOME,
      });
    }

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
  } finally {
    release();
  }
}

async function aicuFetch(url: string): Promise<FetchResult> {
  // Electron 内嵌窗过不了 Turnstile（会无限弹验证框），CF 一律走系统 Chrome
  if (forceBrowserOnly || Date.now() < clearanceOkUntil) {
    const page = await fetchAicuViaChrome(url);
    if (isGoodJson(page)) {
      forceBrowserOnly = true;
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      browserSessionReady = true;
    }
    await writeDebug(
      `url=${url} proxy=${resolveProxyUrl() || "-"} forceBrowser=true | ${page.via}:${page.status}${page.detail ? `(${page.detail})` : ""}`,
    );
    return page;
  }

  const viaCurl = await fetchViaCurl(url);
  if (isGoodJson(viaCurl)) return viaCurl;

  if (viaCurl.status === 403 || looksLikeCfChallenge(viaCurl.text)) {
    forceBrowserOnly = true;
    interactiveChallengeUsed = true;
    const page = await fetchAicuViaChrome(url);
    if (isGoodJson(page)) {
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      browserSessionReady = true;
    }
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

/** Electron 进程常带奇怪的 NO_PROXY / SSL 变量，子进程继承后会直连被墙 */
function cleanSpawnEnv(proxy: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot || "C:\\Windows",
    windir: process.env.windir || "C:\\Windows",
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    // 清空绕过列表，避免 api.aicu.cc 被当成直连
    NO_PROXY: "localhost,127.0.0.1,::1",
    no_proxy: "localhost,127.0.0.1,::1",
  };
  if (proxy) {
    env.HTTP_PROXY = proxy;
    env.HTTPS_PROXY = proxy;
    env.ALL_PROXY = proxy;
    env.http_proxy = proxy;
    env.https_proxy = proxy;
    env.all_proxy = proxy;
  }
  return env;
}

async function fetchViaPython(url: string): Promise<FetchResult> {
  const python = resolvePython();
  const script = resolveScript();
  if (!python || !script) {
    return {
      status: 0,
      text: "",
      via: "python",
      detail: !python ? "未找到 python" : "未找到 aicu-fetch.py",
    };
  }
  const proxy = resolveProxyUrl();
  try {
    const args =
      python.toLowerCase() === "py"
        ? ["-3", script, url, ...(proxy ? ["--proxy", proxy] : [])]
        : [script, url, ...(proxy ? ["--proxy", proxy] : [])];
    const { stdout, stderr } = await execFileAsync(python, args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      env: cleanSpawnEnv(proxy),
    });
    const raw = stdout.trim() || stderr.trim();
    const parsed = JSON.parse(raw) as {
      ok?: boolean;
      status?: number;
      body?: string;
      error?: string;
      proxy?: string;
    };
    if (parsed.status === 403) {
      await writeDebug(
        `python 403 body=${String(parsed.body || "").slice(0, 180)} proxy=${parsed.proxy || proxy || ""}`,
      );
    }
    return {
      status: Number(parsed.status) || 0,
      text: String(parsed.body ?? ""),
      via: "python",
      detail:
        parsed.error || (parsed.proxy ? `proxy=${parsed.proxy}` : undefined),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: string }).stdout || "")
        : "";
    if (stdout.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(stdout.trim()) as {
          status?: number;
          body?: string;
          error?: string;
        };
        return {
          status: Number(parsed.status) || 0,
          text: String(parsed.body ?? ""),
          via: "python",
          detail: parsed.error || message,
        };
      } catch {
        // fall through
      }
    }
    return { status: 0, text: "", via: "python", detail: message };
  }
}

async function fetchViaCurl(
  url: string,
  cookieHeader = "",
): Promise<FetchResult> {
  const curlBin = existsSync(SYSTEM_CURL) ? SYSTEM_CURL : "curl.exe";
  try {
    const proxy = resolveProxyUrl();
    const args = [
      "-sS",
      "-L",
      "--max-time",
      "45",
      "-A",
      aicuUserAgent(),
      "-e",
      HOME,
      "-H",
      "Accept: application/json, text/plain, */*",
      "-H",
      "Origin: https://www.aicu.cc",
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
    ];
    if (cookieHeader) {
      args.push("-H", `Cookie: ${cookieHeader}`);
    }
    if (proxy) args.push("-x", proxy);
    args.push(url);

    const { stdout, stderr } = await execFileAsync(curlBin, args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      env: cleanSpawnEnv(proxy),
    });
    const marker = "\n__HTTP_STATUS__:";
    const idx = stdout.lastIndexOf(marker);
    if (idx < 0) {
      return {
        status: 0,
        text: stdout.slice(0, 300),
        via: "curl",
        detail: stderr.slice(0, 200) || "无状态码",
      };
    }
    const status = Number(stdout.slice(idx + marker.length).trim()) || 0;
    const text = stdout.slice(0, idx).replace(/\r$/, "");
    if (status === 403) {
      await writeDebug(`curl 403 body=${text.slice(0, 180)}`);
    }
    return { status, text, via: "curl" };
  } catch (error) {
    return {
      status: 0,
      text: "",
      via: "curl",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchViaPowerShell(url: string): Promise<FetchResult> {
  const proxy = resolveProxyUrl();
  const script = `
$ErrorActionPreference = 'Stop'
$url = ${JSON.stringify(url)}
$proxy = ${JSON.stringify(proxy || "")}
try {
  $headers = @{
    'User-Agent' = ${JSON.stringify(aicuUserAgent())}
    'Referer' = ${JSON.stringify(HOME)}
    'Accept' = 'application/json, text/plain, */*'
  }
  if ($proxy) {
    $resp = Invoke-WebRequest -Uri $url -Headers $headers -Proxy $proxy -UseBasicParsing -TimeoutSec 45
  } else {
    $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 45
  }
  Write-Output ("__STATUS__:" + [int]$resp.StatusCode)
  Write-Output $resp.Content
} catch {
  $code = 0
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $code = [int]$_.Exception.Response.StatusCode
  }
  Write-Output ("__STATUS__:" + $code)
  Write-Output $_.Exception.Message
  exit 1
}
`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
        env: cleanSpawnEnv(proxy),
      },
    );
    const lines = stdout.replace(/^\uFEFF/, "").split(/\r?\n/);
    const statusLine = lines.find((line) => line.startsWith("__STATUS__:"));
    const status = Number(statusLine?.slice("__STATUS__:".length) || 0);
    const text = lines
      .filter((line) => !line.startsWith("__STATUS__:"))
      .join("\n")
      .trim();
    return { status, text, via: "powershell" };
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: string }).stdout || "")
        : "";
    if (stdout.includes("__STATUS__:")) {
      const lines = stdout.split(/\r?\n/);
      const statusLine = lines.find((line) => line.startsWith("__STATUS__:"));
      const status = Number(statusLine?.slice("__STATUS__:".length) || 0);
      const text = lines
        .filter((line) => !line.startsWith("__STATUS__:"))
        .join("\n")
        .trim();
      return {
        status,
        text,
        via: "powershell",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      status: 0,
      text: "",
      via: "powershell",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchViaNet(url: string): Promise<FetchResult> {
  try {
    const proxy = resolveProxyUrl();
    const ses = aicuSession();
    if (proxy) {
      await ses.setProxy({
        proxyRules: proxy.replace(/^https?:\/\//i, ""),
      });
    }
    const res = await ses.fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": aicuUserAgent(),
        Referer: HOME,
      },
    });
    return { status: res.status, text: await res.text(), via: "session" };
  } catch (error) {
    try {
      const res = await net.fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": aicuUserAgent(),
          Referer: HOME,
        },
      });
      return { status: res.status, text: await res.text(), via: "net" };
    } catch (inner) {
      return {
        status: 0,
        text: "",
        via: "net",
        detail: inner instanceof Error ? inner.message : String(inner),
      };
    }
  }
}

async function fetchViaInPageXhr(url: string): Promise<FetchResult> {
  const win = bridge;
  if (!win || win.isDestroyed()) {
    return { status: 0, text: "", via: "page-xhr", detail: "无浏览器会话" };
  }
  try {
    const result = (await win.webContents.executeJavaScript(
      `(() => {
        const target = ${JSON.stringify(url)};
        return fetch(target, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            Referer: ${JSON.stringify(HOME)}
          }
        }).then(async (res) => ({
          status: res.status,
          text: await res.text()
        })).catch((err) => ({
          status: 0,
          text: String(err && err.message ? err.message : err)
        }));
      })()`,
    )) as { status: number; text: string };
    return { status: result.status, text: result.text, via: "page-xhr" };
  } catch (error) {
    return {
      status: 0,
      text: "",
      via: "page-xhr",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function aicuGet(
  pathName: string,
  params: Record<string, string | number>,
) {
  const url = new URL(`${BASE}${pathName}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // 验证后首页应走 cache；失败就快速报错，避免 UI 卡在「准备中」好几分钟
  const maxAttempts = forceBrowserOnly ? 1 : 2;
  let last: FetchResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await throttle();
    const res = await aicuFetch(url.toString());
    last = res;
    if (isGoodJson(res)) {
      let data: {
        code?: number;
        message?: string;
        data?: Record<string, unknown>;
      };
      try {
        data = JSON.parse(res.text) as typeof data;
      } catch {
        throw new Error(`AICU 返回了非 JSON（${res.via}）`);
      }
      if (data.code !== 0) {
        throw new Error(data.message || `AICU 错误 code=${String(data.code)}`);
      }
      return (data.data ?? {}) as Record<string, unknown>;
    }

    const retryable =
      res.status === 403 ||
      res.status === 429 ||
      res.status === 0 ||
      looksLikeCfChallenge(res.text);
    if (!retryable || attempt === maxAttempts) break;
    if (interactiveChallengeUsed) break;
    const waitMs = 1200 * attempt;
    await writeDebug(
      `retry ${attempt}/${maxAttempts} ${pathName} status=${res.status} wait=${waitMs}`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const res = last || { status: 0, text: "", via: "unknown" };
  if (res.status === 403 || looksLikeCfChallenge(res.text)) {
    const proxy = resolveProxyUrl();
    throw new Error(
      proxy
        ? `AICU 仍被拦截（经 ${res.via}）。请重新同步：在弹出的系统 Chrome 里勾选「请验证您是真人」，等到出现 JSON 即可（应用内窗口已不再使用）。`
        : `AICU 403（经 ${res.via}，未检测到代理）。请开启系统代理后重试。`,
    );
  }
  if (res.status === 0) {
    throw new Error(
      `AICU 请求失败（${res.via}）：${res.detail || res.text || "网络错误"}`,
    );
  }
  throw new Error(`AICU 请求失败：HTTP ${res.status}（${res.via}）`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function fetchAicuReplies(
  uid: number,
  pn: number,
  ps = 50,
): Promise<AicuPageResult> {
  const data = await aicuGet("/search/getreply", {
    uid,
    pn,
    ps,
    mode: 0,
  });
  const cursor = asRecord(data.cursor);
  const replies = Array.isArray(data.replies) ? data.replies : [];
  const items: FootprintItem[] = [];

  for (const raw of replies) {
    const row = asRecord(raw);
    const dyn = asRecord(row.dyn);
    const rpid = String(row.rpid ?? "").trim();
    if (!rpid) continue;
    const oid = Number(dyn.oid) || 0;
    const type = Number(dyn.type) || 1;
    const time = Number(row.time) || 0;
    items.push({
      id: `comment:${rpid}`,
      kind: "comment",
      text: String(row.message ?? ""),
      time,
      oid,
      type,
      rpid,
      source: "aicu",
    });
  }

  return {
    items,
    isEnd: Boolean(cursor.is_end) || replies.length === 0,
    allCount: Number(cursor.all_count) || 0,
  };
}

export async function fetchAicuVideoDanmaku(
  uid: number,
  pn: number,
  ps = 50,
): Promise<AicuPageResult> {
  const data = await aicuGet("/search/getvideodm", {
    uid,
    pn,
    ps,
  });
  const cursor = asRecord(data.cursor);
  const list = Array.isArray(data.videodmlist)
    ? data.videodmlist
    : Array.isArray(data.danmaku)
      ? data.danmaku
      : [];
  const items: FootprintItem[] = [];

  for (const raw of list) {
    const row = asRecord(raw);
    const id = String(row.id ?? row.idStr ?? row.dmid ?? "").trim();
    if (!id) continue;
    const oid = Number(row.oid) || 0;
    const time = Number(row.ctime ?? row.time) || 0;
    const progress = Number(row.progress ?? row.progress_ms);
    items.push({
      id: `danmaku:${id}`,
      kind: "danmaku",
      text: String(row.content ?? row.text ?? row.message ?? ""),
      time,
      oid,
      progressMs: Number.isFinite(progress) ? Math.max(0, progress) : undefined,
      source: "aicu",
    });
  }

  return {
    items,
    isEnd: Boolean(cursor.is_end) || list.length === 0,
    allCount: Number(cursor.all_count) || 0,
  };
}
