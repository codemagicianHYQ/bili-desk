/**
 * 用系统 Chrome 拉 AICU：Electron 内嵌窗过不了 Cloudflare Turnstile（会无限刷新验证框）。
 * 真 Chrome 里点一次真人即可，后续分页复用同一配置目录的 cookie。
 */
import { execFile, spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { promisify } from "util";
import { app } from "electron";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);

const DEBUG_PORT = 9339;
const HOME = "https://www.aicu.cc/";

type ChallengeListener = (
  state: "open" | "waiting" | "done" | "fail",
  detail?: string,
) => void;

let chromeProc: ChildProcess | null = null;
let listener: ChallengeListener | null = null;
let chain: Promise<unknown> = Promise.resolve();

export function setAicuChromeListener(cb: ChallengeListener | null): void {
  listener = cb;
}

export function resetAicuChromeGate(): void {
  chain = Promise.resolve();
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
  ];
  for (const file of candidates) {
    if (file && existsSync(file)) return file;
  }
  return null;
}

function profileDir(): string {
  const dir = path.join(app.getPath("userData"), "aicu-chrome-profile");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function isDebugPortOpen(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureChrome(): Promise<void> {
  if (await isDebugPortOpen()) return;

  const bin = findChrome();
  if (!bin) {
    throw new Error("未找到 Chrome/Edge，无法完成 AICU 人机验证");
  }

  chromeProc = spawn(
    bin,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir()}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      "--new-window",
      "about:blank",
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  chromeProc.unref();

  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (await isDebugPortOpen()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Chrome 调试端口启动超时");
}

type CdpResult = {
  id?: number;
  method?: string;
  result?: unknown;
  error?: unknown;
};

class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on("message", (raw) => {
      const data = typeof raw === "string" ? raw : raw.toString("utf8");
      let msg: CdpResult;
      try {
        msg = JSON.parse(data) as CdpResult;
      } catch {
        return;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(JSON.stringify(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      }
    });
  }

  static async connect(): Promise<CdpSession> {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const list = (await listRes.json()) as Array<{
      type: string;
      url: string;
      webSocketDebuggerUrl?: string;
    }>;
    let page =
      list.find(
        (t) =>
          t.type === "page" &&
          t.webSocketDebuggerUrl &&
          !t.url.startsWith("devtools://"),
      ) || list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
        method: "PUT",
      }).catch(async () => {
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`);
      });
      const list2 = (await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      ).json()) as typeof list;
      page = list2.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    }
    if (!page?.webSocketDebuggerUrl) {
      throw new Error("无法连接 Chrome 页面");
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", () => reject(new Error("Chrome CDP 连接失败")));
    });
    return new CdpSession(ws);
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 60_000);
    });
  }

  async evaluate(expression: string): Promise<string> {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: unknown } };
    const value = result?.result?.value;
    return value == null ? "" : String(value);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(t) as { code?: number };
    return typeof parsed.code === "number";
  } catch {
    return false;
  }
}

function looksLikeCf(text: string): boolean {
  return /just a moment|请验证您是真人|正在进行安全验证|cf-browser-verification/i.test(
    text,
  );
}

export async function fetchAicuViaChrome(url: string): Promise<{
  status: number;
  text: string;
  via: string;
  detail?: string;
}> {
  const prev = chain;
  let release!: () => void;
  chain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev.catch(() => undefined);

  let session: CdpSession | null = null;
  try {
    await ensureChrome();
    session = await CdpSession.connect();
    await session.send("Page.enable").catch(() => undefined);
    await session.send("Runtime.enable").catch(() => undefined);

    listener?.(
      "open",
      "已打开系统 Chrome：请在 Chrome 里勾选「请验证您是真人」（只点一次）",
    );

    await session.send("Page.navigate", {
      url,
      referrer: HOME,
    });

    const started = Date.now();
    let toldWaiting = false;
    while (Date.now() - started < 300_000) {
      await new Promise((r) => setTimeout(r, 1500));
      const text = (
        await session.evaluate(
          `(() => {
            const pre = document.querySelector("pre");
            if (pre && pre.innerText) return pre.innerText;
            return document.body ? (document.body.innerText || "") : "";
          })()`,
        )
      ).trim();

      if (looksLikeJson(text)) {
        listener?.("done", "Chrome 已拿到数据，继续同步…");
        return { status: 200, text, via: "chrome" };
      }

      if (looksLikeCf(text) && !toldWaiting) {
        toldWaiting = true;
        listener?.(
          "waiting",
          "请到弹出的 Chrome 窗口勾选真人，点一次后等待，不要关 Chrome",
        );
      }
    }

    listener?.("fail", "Chrome 验证超时");
    return {
      status: 403,
      text: "",
      via: "chrome",
      detail: "等待 Chrome 人机验证超时",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    listener?.("fail", detail);
    return { status: 0, text: "", via: "chrome", detail };
  } finally {
    session?.close();
    release();
  }
}

export async function closeAicuChrome(): Promise<void> {
  // 不强制杀用户 Chrome 主进程；只尝试关掉我们的调试实例对应进程树较难，留给用户手动关窗
  if (chromeProc && !chromeProc.killed) {
    try {
      if (process.platform === "win32" && chromeProc.pid) {
        await execFileAsync(
          "taskkill",
          ["/PID", String(chromeProc.pid), "/T", "/F"],
          { windowsHide: true },
        ).catch(() => undefined);
      } else {
        chromeProc.kill();
      }
    } catch {
      // ignore
    }
  }
  chromeProc = null;
}
