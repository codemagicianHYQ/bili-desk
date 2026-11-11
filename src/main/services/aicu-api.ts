import { execFile, execFileSync } from "child_process";
import { existsSync } from "fs";
import { appendFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { app, BrowserWindow, net, session } from "electron";
import type { FootprintItem } from "@shared/types";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://api.aicu.cc/api/v3";
const HOME = "https://www.aicu.cc/";
const PARTITION = "persist:aicu";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_GAP_MS = 900;
const SYSTEM_CURL = "C:\\Windows\\System32\\curl.exe";

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

/** 每次点「同步历史」开头调用，允许再弹一次验证（仍不会连弹） */
export function resetAicuChallengeGate(): void {
  interactiveChallengeUsed = false;
  clearanceGate = null;
}
let cachedProxy: string | null | undefined;
let cachedPython: string | null | undefined;
let cachedScript: string | null | undefined;

function aicuSession() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(UA);
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

async function cookieHeaderForAicu(): Promise<string> {
  const cookies = await aicuSession().cookies.get({});
  return cookies
    .filter((cookie) => String(cookie.domain || "").includes("aicu"))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

/** 只打开官网一次做人机验证，拿 cf_clearance；不要反复 load API 页 */
async function ensureInteractiveClearance(): Promise<boolean> {
  if (Date.now() < clearanceOkUntil && (await readClearanceCookie())) {
    return true;
  }
  if (clearanceGate) return clearanceGate;

  clearanceGate = (async () => {
    // 整次同步只弹一次：弹过且没拿到 cookie 也不再刷窗
    if (interactiveChallengeUsed) {
      const existing = await readClearanceCookie();
      if (existing) {
        clearanceOkUntil = Date.now() + 25 * 60 * 1000;
        return true;
      }
      return false;
    }
    interactiveChallengeUsed = true;

    const proxy = resolveProxyUrl();
    const ses = aicuSession();
    if (proxy) {
      await ses.setProxy({
        proxyRules: proxy.replace(/^https?:\/\//i, ""),
      });
    }

    if (bridge && !bridge.isDestroyed()) {
      try {
        bridge.destroy();
      } catch {
        // ignore
      }
      bridge = null;
    }

    const win = new BrowserWindow({
      show: true,
      width: 920,
      height: 640,
      title: "AICU 安全验证（只需一次）",
      autoHideMenuBar: true,
      alwaysOnTop: true,
      webPreferences: {
        partition: PARTITION,
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    bridge = win;
    win.on("closed", () => {
      if (bridge === win) bridge = null;
    });
    win.webContents.setUserAgent(UA);

    // 只加载官网，不要反复打开 api 地址（否则验证完又跳挑战）
    await win.loadURL(HOME, { userAgent: UA, httpReferrer: HOME });

    const ok = await waitForClearance(win, 180_000);
    if (!win.isDestroyed()) {
      win.hide();
    }
    if (ok) {
      clearanceOkUntil = Date.now() + 25 * 60 * 1000;
      await writeDebug("cf_clearance ok");
    } else {
      await writeDebug("cf_clearance timeout/cancel");
    }
    return ok;
  })().finally(() => {
    clearanceGate = null;
  });

  return clearanceGate;
}

async function waitForClearance(
  win: BrowserWindow,
  timeoutMs: number,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (win.isDestroyed()) return false;
    const value = await readClearanceCookie();
    if (value) {
      // 给 Turnstile 一点落盘时间
      await new Promise((resolve) => setTimeout(resolve, 600));
      return true;
    }
    const title = win.webContents.getTitle();
    // 官网已离开挑战页且无挑战控件时，也尝试用页面 fetch 探活
    if (title && !/just a moment|请稍候|验证/i.test(title)) {
      const probe = await win.webContents
        .executeJavaScript(
          `fetch(${JSON.stringify(`${BASE}/search/getreply?uid=1&pn=1&ps=1&mode=0`)}, {
            credentials: "include",
            headers: { Accept: "application/json", Referer: ${JSON.stringify(HOME)} }
          }).then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 80) }))
           .catch((e) => ({ status: 0, text: String(e) }))`,
        )
        .catch(() => null);
      if (
        probe &&
        probe.status === 200 &&
        String(probe.text || "").startsWith("{")
      ) {
        clearanceOkUntil = Date.now() + 25 * 60 * 1000;
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return Boolean(await readClearanceCookie());
}

async function aicuFetch(url: string): Promise<FetchResult> {
  const attempts: FetchResult[] = [];
  const cookie = await cookieHeaderForAicu();

  const viaCurl = await fetchViaCurl(url, cookie);
  attempts.push(viaCurl);
  if (isGoodJson(viaCurl)) return viaCurl;

  const viaSession = await fetchViaNet(url);
  attempts.push(viaSession);
  if (isGoodJson(viaSession)) return viaSession;

  const viaPython = await fetchViaPython(url);
  attempts.push(viaPython);
  if (isGoodJson(viaPython)) return viaPython;

  const blocked = attempts.some(
    (item) => item.status === 403 || looksLikeCfChallenge(item.text),
  );

  if (blocked) {
    const cleared = await ensureInteractiveClearance();
    if (cleared) {
      const cookie2 = await cookieHeaderForAicu();
      const afterCurl = await fetchViaCurl(url, cookie2);
      attempts.push(afterCurl);
      if (isGoodJson(afterCurl)) return afterCurl;

      const afterSession = await fetchViaNet(url);
      attempts.push(afterSession);
      if (isGoodJson(afterSession)) return afterSession;

      // 用已验证的隐藏窗口 fetch，不再 loadURL 弹挑战
      const afterPage = await fetchViaPageQuiet(url);
      attempts.push(afterPage);
      if (isGoodJson(afterPage)) return afterPage;
    }
  }

  await writeDebug(
    `url=${url} proxy=${resolveProxyUrl() || "-"} | ` +
      attempts
        .map(
          (item) =>
            `${item.via}:${item.status}${item.detail ? `(${item.detail})` : ""}`,
        )
        .join(" | "),
  );

  return (
    attempts.find((item) => isGoodJson(item)) ||
    attempts.find((item) => item.status === 403) ||
    attempts.find((item) => item.status > 0) ||
    viaCurl
  );
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
      UA,
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
    'User-Agent' = ${JSON.stringify(UA)}
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
        "User-Agent": UA,
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
          "User-Agent": UA,
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

/** 已有验证窗口时静默 fetch，禁止再 loadURL 弹挑战页 */
async function fetchViaPageQuiet(url: string): Promise<FetchResult> {
  try {
    const win =
      bridge && !bridge.isDestroyed()
        ? bridge
        : await (async () => {
            const proxy = resolveProxyUrl();
            const ses = aicuSession();
            if (proxy) {
              await ses.setProxy({
                proxyRules: proxy.replace(/^https?:\/\//i, ""),
              });
            }
            const created = new BrowserWindow({
              show: false,
              width: 920,
              height: 640,
              title: "AICU",
              autoHideMenuBar: true,
              webPreferences: {
                partition: PARTITION,
                backgroundThrottling: false,
                nodeIntegration: false,
                contextIsolation: true,
              },
            });
            created.webContents.setUserAgent(UA);
            await created.loadURL(HOME, {
              userAgent: UA,
              httpReferrer: HOME,
            });
            bridge = created;
            created.on("closed", () => {
              if (bridge === created) bridge = null;
            });
            return created;
          })();

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
    return { status: result.status, text: result.text, via: "page" };
  } catch (error) {
    return {
      status: 0,
      text: "",
      via: "page",
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

  // 验证窗只在 aicuFetch 内触发一次；这里最多静默重试 2 次
  const maxAttempts = 3;
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
    // 已经弹过验证窗就别狂重试刷屏
    if (interactiveChallengeUsed && !(await readClearanceCookie())) break;
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
        ? `AICU 仍被 Cloudflare 拦截（经 ${res.via}）。请完成一次验证后等半分钟再同步；勿连续狂点。`
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
