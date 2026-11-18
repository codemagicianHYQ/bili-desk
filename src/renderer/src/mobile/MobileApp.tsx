import { useEffect, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  createLoginQr,
  currentUserId,
  getPlay,
  getPopular,
  getRecommend,
  isLoggedIn,
  logout,
  pollLogin,
  searchVideos,
  type MobilePlay,
  type MobileVideo,
} from "./bili-client";

type Tab = "home" | "hot" | "search" | "me";

function formatCount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n || 0);
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(rest)}`;
  return `${minutes}:${pad(rest)}`;
}

function VideoGrid({
  videos,
  onOpen,
}: {
  videos: MobileVideo[];
  onOpen: (bvid: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {videos.map((video) => (
        <button
          key={video.bvid}
          type="button"
          onClick={() => onOpen(video.bvid)}
          className="overflow-hidden rounded-xl bg-card text-left"
        >
          <span className="relative block aspect-video bg-secondary">
            {video.cover ? (
              <img
                src={video.cover}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : null}
            {video.duration > 0 && (
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">
                {formatDuration(video.duration)}
              </span>
            )}
          </span>
          <span className="block px-2 py-2">
            <span className="line-clamp-2 text-sm leading-5">{video.title}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {video.author || "未知"} · {formatCount(video.play)}播放
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Feed({
  title,
  source,
}: {
  title: string;
  source: "home" | "hot";
}) {
  const load = source === "home" ? getRecommend : getPopular;
  const navigate = useNavigate();
  const [videos, setVideos] = useState<MobileVideo[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void load(1)
      .then((list) => {
        if (!alive) return;
        setVideos(list);
        setPage(1);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [source, load]);

  const more = async () => {
    const next = page + 1;
    setLoading(true);
    try {
      const list = await load(next);
      setVideos((prev) => [...prev, ...list]);
      setPage(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-3 pb-4 pt-3">
      <h1 className="mb-3 text-lg font-semibold">{title}</h1>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <VideoGrid videos={videos} onOpen={(bvid) => navigate(`/video/${bvid}`)} />
      <button
        type="button"
        disabled={loading}
        onClick={() => void more()}
        className="mt-4 w-full rounded-full bg-secondary py-2 text-sm text-secondary-foreground"
      >
        {loading ? "加载中..." : "加载更多"}
      </button>
    </section>
  );
}

function SearchPane() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [videos, setVideos] = useState<MobileVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async (nextPage: number) => {
    const term = keyword.trim();
    if (!term) return;
    setLoading(true);
    setError("");
    try {
      const result = await searchVideos(term, nextPage);
      setVideos((prev) => (nextPage === 1 ? result.videos : [...prev, ...result.videos]));
      setTotal(result.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-3 pb-4 pt-3">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(1);
        }}
      >
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索视频"
          className="h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none"
        />
        <button
          type="submit"
          className="h-10 rounded-full bg-primary px-4 text-sm text-primary-foreground"
        >
          搜索
        </button>
      </form>
      {total > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">约 {total.toLocaleString()} 条结果</p>
      )}
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <VideoGrid videos={videos} onOpen={(bvid) => navigate(`/video/${bvid}`)} />
      {videos.length > 0 && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void run(page + 1)}
          className="mt-4 w-full rounded-full bg-secondary py-2 text-sm"
        >
          {loading ? "加载中..." : "下一页"}
        </button>
      )}
    </section>
  );
}

function MePane() {
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");
  const [logged, setLogged] = useState(isLoggedIn());

  const start = async () => {
    setStatus("正在获取二维码...");
    setQr("");
    try {
      const login = await createLoginQr();
      setQr(await QRCode.toDataURL(login.url, { margin: 1, width: 240 }));
      setStatus("请用 B 站 App 扫码");
      for (let i = 0; i < 40; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const state = await pollLogin(login.key);
        if (state === "scanned") setStatus("已扫码，请在手机上确认");
        if (state === "ok") {
          setLogged(true);
          setQr("");
          setStatus("登录成功");
          return;
        }
        if (state === "expired") {
          setStatus("二维码过期了，再试一次");
          return;
        }
      }
      setStatus("等待超时，再试一次");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "登录失败");
    }
  };

  return (
    <section className="px-4 py-6">
      <h1 className="text-lg font-semibold">我的</h1>
      {logged ? (
        <div className="mt-4 rounded-2xl bg-card p-4">
          <p className="text-sm">已登录 UID {currentUserId()}</p>
          <button
            type="button"
            onClick={() => {
              logout();
              setLogged(false);
              setStatus("已退出");
            }}
            className="mt-3 rounded-full bg-secondary px-4 py-2 text-sm"
          >
            退出登录
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-card p-4">
          <p className="text-sm text-muted-foreground">扫码登录后，推荐和播放会带上你的账号。</p>
          <button
            type="button"
            onClick={() => void start()}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            扫码登录
          </button>
          {qr && <img src={qr} alt="登录二维码" className="mx-auto mt-4 w-48 rounded-lg bg-white p-2" />}
        </div>
      )}
      {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
    </section>
  );
}

export function PlayerPage() {
  const { bvid = "" } = useParams();
  const navigate = useNavigate();
  const [play, setPlay] = useState<MobilePlay | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setPlay(null);
    setError("");
    void getPlay(bvid)
      .then((item) => {
        if (alive) setPlay(item);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "播放失败");
      });
    return () => {
      alive = false;
    };
  }, [bvid]);

  return (
    <section className="min-h-full bg-black text-white">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="px-3 py-3 text-sm text-white/80"
      >
        返回
      </button>
      {error && <p className="px-3 text-sm text-red-400">{error}</p>}
      {play ? (
        <>
          <video
            key={play.url}
            src={play.url}
            poster={play.cover}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full bg-black"
          />
          <div className="px-3 py-3">
            <h1 className="text-base font-medium">{play.title}</h1>
            <p className="mt-1 text-sm text-white/60">{play.author}</p>
          </div>
        </>
      ) : (
        !error && <p className="px-3 text-sm text-white/60">正在准备播放...</p>
      )}
    </section>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "home", label: "首页" },
  { id: "hot", label: "热门" },
  { id: "search", label: "搜索" },
  { id: "me", label: "我的" },
];

export function MobileShell() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-base font-semibold">BiliLoft</span>
        <span className="text-xs text-muted-foreground">手机版</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "home" && <Feed title="推荐" source="home" />}
        {tab === "hot" && <Feed title="热门" source="hot" />}
        {tab === "search" && <SearchPane />}
        {tab === "me" && <MePane />}
      </main>
      <nav className="grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`py-3 text-sm ${tab === item.id ? "text-primary" : "text-muted-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function MobileApp() {
  return (
    <Routes>
      <Route path="/video/:bvid" element={<PlayerPage />} />
      <Route path="*" element={<MobileShell />} />
    </Routes>
  );
}
