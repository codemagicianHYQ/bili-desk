import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AtSign,
  Bell,
  BellOff,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pin,
  Reply,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type {
  ChatEmote,
  ChatMessage,
  MessageFeedItem,
  MessageFeedKind,
  MessageSession,
  MessageSessionFilter,
  MessageSettings,
  MessageUnread,
  SystemNotice,
} from "@shared/types";
import { parseBiliAppPath } from "@shared/utils/bili-app-link";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type MessageTab = "chat" | MessageFeedKind | "sent" | "sys" | "settings";

const TABS: Array<{
  id: MessageTab;
  label: string;
  icon: typeof MessageCircle;
  hint: string;
}> = [
  {
    id: "chat",
    label: "私信",
    icon: MessageCircle,
    hint: "会话、应援团与小助手",
  },
  { id: "reply", label: "回复我的", icon: Reply, hint: "别人回复你的评论" },
  {
    id: "sent",
    label: "我回复的",
    icon: MessageSquare,
    hint: "别人回复过的、你发出的评论",
  },
  { id: "at", label: "@ 我的", icon: AtSign, hint: "评论与动态里的提及" },
  { id: "like", label: "收到的赞", icon: Heart, hint: "赞过你的人" },
  { id: "sys", label: "系统通知", icon: Bell, hint: "官方通知" },
  {
    id: "settings",
    label: "消息设置",
    icon: Settings2,
    hint: "提醒、折叠与屏蔽词",
  },
];

const FILTERS: Array<{ id: MessageSessionFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "followed", label: "已关注" },
  { id: "unfollowed", label: "未关注" },
  { id: "group", label: "应援团" },
  { id: "intercepted", label: "已拦截" },
];

const EMPTY_UNREAD: MessageUnread = {
  reply: 0,
  at: 0,
  like: 0,
  sys: 0,
  chat: 0,
  group: 0,
  dustbin: 0,
};

function tidyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "操作失败";
  return message.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatMessageTime(seconds: number, fallback = ""): string {
  if (!seconds) return fallback;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return fallback;
  const now = new Date();
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) return hm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function unreadOf(tab: MessageTab, unread: MessageUnread): number {
  if (tab === "chat") return unread.chat + unread.group + unread.dustbin;
  if (tab === "reply") return unread.reply;
  if (tab === "at") return unread.at;
  if (tab === "like") return unread.like;
  if (tab === "sys") return unread.sys;
  return 0;
}

function aidToBvid(aid: number): string {
  const xor = 23442827791579n;
  const maxAid = 1n << 51n;
  const alphabet = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
  const bytes = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
  let index = bytes.length - 1;
  let tmp = (maxAid | BigInt(aid)) ^ xor;
  while (tmp > 0n) {
    bytes[index] = alphabet[Number(tmp % 58n)];
    tmp /= 58n;
    index -= 1;
  }
  [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
  [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
  return bytes.join("");
}

function schemeToHttps(uri: string): string | null {
  const video = uri.match(/^bilibili:\/\/video\/(\d+)/);
  if (video) return `https://www.bilibili.com/video/av${video[1]}`;
  const space = uri.match(/^bilibili:\/\/space\/(\d+)/);
  if (space) return `https://space.bilibili.com/${space[1]}`;
  const live = uri.match(/^bilibili:\/\/live\/(\d+)/);
  if (live) return `https://live.bilibili.com/${live[1]}`;
  const article = uri.match(/^bilibili:\/\/article\/(\d+)/);
  if (article) return `https://www.bilibili.com/read/cv${article[1]}`;
  const opus = uri.match(
    /^bilibili:\/\/(?:opus\/detail|following\/detail)\/(\d+)/,
  );
  if (opus) return `https://www.bilibili.com/opus/${opus[1]}`;
  return null;
}

function includesTerm(text: string, keyword: string): boolean {
  const term = keyword.trim().toLowerCase();
  if (!term) return true;
  return text.toLowerCase().includes(term);
}

function canLocate(item: MessageFeedItem): boolean {
  return item.subjectId > 0 && (item.sourceId > 0 || item.rootId > 0);
}

function locateComment(
  item: MessageFeedItem,
  navigate: (path: string) => void,
): void {
  const rpid = item.sourceId || item.rootId;
  const root = item.rootId || rpid;
  const type = item.businessId || 1;
  const oid = item.subjectId;
  if (!rpid || !oid) {
    void openTarget(item.uri, navigate);
    return;
  }
  const query = `?rpid=${rpid}&root=${root}`;
  const bv = item.uri.match(/\/video\/(BV[0-9A-Za-z]+)/);
  if (bv) {
    navigate(`/video/${bv[1]}${query}`);
    return;
  }
  if (type === 1) {
    navigate(`/video/${aidToBvid(oid)}${query}`);
    return;
  }
  if (type === 12) {
    navigate(`/article/${oid}${query}`);
    return;
  }
  if (type === 11 || type === 17) {
    navigate(`/dynamic/${oid}${query}`);
    return;
  }
  void openTarget(item.uri, navigate);
}

async function openTarget(
  uri: string,
  navigate: (path: string) => void,
): Promise<void> {
  const raw = uri.trim();
  if (!raw) return;
  const href = raw.startsWith("bilibili://")
    ? (schemeToHttps(raw) ?? raw)
    : raw;
  const av = href.match(/\/video\/av(\d+)/i);
  if (av) {
    navigate(`/video/${aidToBvid(Number(av[1]))}`);
    return;
  }
  const direct = parseBiliAppPath(href);
  if (direct) {
    navigate(direct);
    return;
  }
  await openBiliHref(href, navigate);
}

function refreshUnread(): void {
  window.dispatchEvent(new Event("bilidesk:msg-unread"));
}

const LOCAL_SENT_KEY = "bilidesk:my-sent-replies";

function readLocalSent(): MessageFeedItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as MessageFeedItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function rememberLocalSent(item: MessageFeedItem): void {
  const next = [
    item,
    ...readLocalSent().filter((row) => row.id !== item.id),
  ].slice(0, 40);
  localStorage.setItem(LOCAL_SENT_KEY, JSON.stringify(next));
}

function sourceNote(source: number): string {
  if (source >= 8 && source <= 11) return "自动回复";
  if (source === 18) return "系统提示";
  return "";
}

function RichText({ text, emotes }: { text: string; emotes: ChatEmote[] }) {
  const parts = useMemo(() => text.split(/(\[[^[\]]+\])/g), [text]);
  const map = useMemo(
    () => new Map(emotes.map((item) => [item.text, item.url])),
    [emotes],
  );
  return (
    <>
      {parts.map((part, index) => {
        const url = map.get(part);
        if (!url) return <span key={`${part}-${index}`}>{part}</span>;
        return (
          <img
            key={`${part}-${index}`}
            src={url}
            alt={part}
            className="mx-0.5 inline-block h-5 w-5 align-text-bottom"
          />
        );
      })}
    </>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessageCircle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

export function MessagesPage() {
  const user = useAppStore((state) => state.user);
  const loggedIn = Boolean(user?.isLogin && (user.mid ?? 0) > 0);
  const [tab, setTab] = useState<MessageTab>("chat");
  const [keyword, setKeyword] = useState("");
  const [unread, setUnread] = useState<MessageUnread>(EMPTY_UNREAD);

  const loadUnread = useCallback(async () => {
    try {
      setUnread(await window.biliDesk.bili.getMessageUnread());
    } catch {
      // 侧边栏会继续轮询
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    void loadUnread();
    const onRefresh = () => void loadUnread();
    window.addEventListener("bilidesk:msg-unread", onRefresh);
    return () => window.removeEventListener("bilidesk:msg-unread", onRefresh);
  }, [loggedIn, loadUnread]);

  if (!loggedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/40">
          <MessageCircle className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">消息</h2>
          <p className="text-sm text-muted-foreground">
            登录后可查看私信、回复、@、赞和系统通知
          </p>
        </div>
        <Button asChild>
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    );
  }

  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-border/70 bg-card/20">
        <div className="px-4 pb-3 pt-5">
          <h2 className="text-base font-semibold tracking-tight">消息</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            与官网消息中心同步
          </p>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            const count = unreadOf(item.id, unread);
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{current.label}</h3>
            <p className="text-xs text-muted-foreground">{current.hint}</p>
          </div>
          {tab !== "settings" && (
            <label className="relative w-64 shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索当前列表"
                className="h-9 w-full rounded-full border border-border bg-background/70 pl-9 pr-3 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
              />
            </label>
          )}
        </header>
        <div className="min-h-0 flex-1">
          {tab === "chat" && (
            <ChatDesk keyword={keyword} onChanged={refreshUnread} />
          )}
          {(tab === "reply" ||
            tab === "at" ||
            tab === "like" ||
            tab === "sent") && (
            <FeedList kind={tab} keyword={keyword} onChanged={refreshUnread} />
          )}
          {tab === "sys" && (
            <NoticeList keyword={keyword} onChanged={refreshUnread} />
          )}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </section>
    </div>
  );
}

function ChatDesk({
  keyword,
  onChanged,
}: {
  keyword: string;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<MessageSessionFilter>("all");
  const [sessions, setSessions] = useState<MessageSession[]>([]);
  const [endTs, setEndTs] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(
    async (append: boolean, cursor: number) => {
      setLoading(true);
      setError("");
      try {
        const page = await window.biliDesk.bili.getMessageSessions(
          filter,
          cursor,
        );
        setSessions((current) => {
          const merged = append ? [...current, ...page.items] : page.items;
          const seen = new Set<string>();
          return merged.filter((item) => {
            const key = `${item.sessionType}:${item.talkerId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
        setEndTs(page.endTs);
        setHasMore(page.hasMore);
        if (!append) {
          setSelectedId((current) => {
            if (
              current &&
              page.items.some(
                (item) => `${item.sessionType}:${item.talkerId}` === current,
              )
            ) {
              return current;
            }
            const first = page.items[0];
            return first ? `${first.sessionType}:${first.talkerId}` : "";
          });
        }
      } catch (err) {
        setError(tidyError(err));
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load(false, 0);
  }, [load]);

  const visibleSessions = sessions.filter((item) =>
    includesTerm(`${item.name} ${item.preview}`, keyword),
  );
  const selected =
    sessions.find(
      (item) => `${item.sessionType}:${item.talkerId}` === selectedId,
    ) ?? null;

  const patchSession = (
    talkerId: string,
    sessionType: number,
    patch: Partial<MessageSession>,
  ) => {
    setSessions((current) =>
      current.map((item) =>
        item.talkerId === talkerId && item.sessionType === sessionType
          ? { ...item, ...patch }
          : item,
      ),
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border/60">
        <div className="flex gap-1 overflow-x-auto px-3 py-3">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors",
                filter === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
          {error && (
            <p className="px-4 py-6 text-center text-xs text-destructive">
              {error}
            </p>
          )}
          {!error && sessions.length === 0 && !loading && (
            <EmptyState title="没有会话" detail="这个分类下还没有消息。" />
          )}
          {!error &&
            sessions.length > 0 &&
            visibleSessions.length === 0 &&
            !loading && (
              <EmptyState
                title="没有匹配的会话"
                detail="换个关键词，或先加载更早的会话。"
              />
            )}
          {visibleSessions.map((item) => {
            const key = `${item.sessionType}:${item.talkerId}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedId(key)}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                  key === selectedId
                    ? "bg-primary/10"
                    : "hover:bg-secondary/70",
                )}
              >
                <Avatar name={item.name} face={item.face} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {item.name || "用户"}
                    </span>
                    {item.pinned && (
                      <Pin className="h-3 w-3 shrink-0 text-primary" />
                    )}
                    {item.muted && (
                      <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {formatMessageTime(item.time)}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {item.preview || "暂无消息"}
                    </span>
                    {item.unread > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                        {item.unread > 99 ? "99+" : item.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {hasMore && (
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => void load(true, endTs)}
              >
                {loading ? "加载中" : "更早的会话"}
              </Button>
            </div>
          )}
          {loading && sessions.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              正在同步会话…
            </p>
          )}
        </div>
      </div>
      <ChatPane
        session={selected}
        keyword={keyword}
        onChanged={onChanged}
        onPatch={patchSession}
        onRemoved={(talkerId, sessionType) => {
          setSessions((current) =>
            current.filter(
              (item) =>
                !(
                  item.talkerId === talkerId && item.sessionType === sessionType
                ),
            ),
          );
          setSelectedId("");
        }}
      />
    </div>
  );
}

function Avatar({ name, face }: { name: string; face: string }) {
  if (face) {
    return (
      <BiliImage
        src={face}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
      {(name || "消").slice(0, 1)}
    </span>
  );
}

function ChatPane({
  session,
  keyword,
  onChanged,
  onPatch,
  onRemoved,
}: {
  session: MessageSession | null;
  keyword: string;
  onChanged: () => void;
  onPatch: (
    talkerId: string,
    sessionType: number,
    patch: Partial<MessageSession>,
  ) => void;
  onRemoved: (talkerId: string, sessionType: number) => void;
}) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<ChatEmote[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [minSeqno, setMinSeqno] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [preview, setPreview] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const onChangedRef = useRef(onChanged);
  const onPatchRef = useRef(onPatch);
  onChangedRef.current = onChanged;
  onPatchRef.current = onPatch;
  const talkerId = session?.talkerId ?? "";
  const sessionType = session?.sessionType ?? 0;

  const mergeEmotes = (incoming: ChatEmote[]) => {
    setEmotes((current) => {
      const map = new Map(current.map((item) => [item.text, item]));
      for (const item of incoming) map.set(item.text, item);
      return [...map.values()];
    });
  };

  const loadLatest = useCallback(async () => {
    if (!talkerId) return;
    setLoading(true);
    setError("");
    try {
      const page = await window.biliDesk.bili.getChatMessages(
        talkerId,
        sessionType,
      );
      setMessages(page.messages);
      mergeEmotes(page.emotes);
      setHasMore(page.hasMore);
      setMinSeqno(page.minSeqno);
      stickToBottom.current = true;
      if (page.maxSeqno) {
        await window.biliDesk.bili.markChatRead(
          talkerId,
          sessionType,
          page.maxSeqno,
        );
        onPatchRef.current(talkerId, sessionType, { unread: 0 });
        onChangedRef.current();
      }
    } catch (err) {
      setError(tidyError(err));
    } finally {
      setLoading(false);
    }
  }, [sessionType, talkerId]);

  useEffect(() => {
    setMessages([]);
    setEmotes([]);
    setDraft("");
    setError("");
    if (!talkerId) return;
    void loadLatest();
    const timer = window.setInterval(() => {
      void window.biliDesk.bili
        .getChatMessages(talkerId, sessionType)
        .then((page) => {
          setMessages((current) => {
            const map = new Map(current.map((item) => [item.seqno, item]));
            for (const item of page.messages) map.set(item.seqno, item);
            return [...map.values()].sort(
              (a, b) => a.time - b.time || a.seqno.localeCompare(b.seqno),
            );
          });
          mergeEmotes(page.emotes);
        })
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadLatest, sessionType, talkerId]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const loadOlder = async () => {
    if (!session || !minSeqno || !hasMore) return;
    const node = scroller.current;
    const previous = node?.scrollHeight ?? 0;
    stickToBottom.current = false;
    try {
      const page = await window.biliDesk.bili.getChatMessages(
        session.talkerId,
        session.sessionType,
        minSeqno,
      );
      setMessages((current) => {
        const map = new Map(page.messages.map((item) => [item.seqno, item]));
        for (const item of current) map.set(item.seqno, item);
        return [...map.values()].sort((a, b) => a.time - b.time);
      });
      mergeEmotes(page.emotes);
      setHasMore(page.hasMore);
      setMinSeqno(page.minSeqno);
      requestAnimationFrame(() => {
        if (!node) return;
        node.scrollTop = node.scrollHeight - previous;
      });
    } catch (err) {
      setError(tidyError(err));
    }
  };

  const send = async () => {
    if (!session || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      await window.biliDesk.bili.sendChatMessage(
        session.talkerId,
        session.sessionType,
        text,
      );
      setDraft("");
      onPatch(session.talkerId, session.sessionType, {
        preview: text,
        time: Math.floor(Date.now() / 1000),
      });
      await loadLatest();
    } catch (err) {
      setError(tidyError(err));
    } finally {
      setSending(false);
    }
  };

  if (!session) {
    return (
      <EmptyState
        title="选择一个会话"
        detail="左侧是全部、已关注、未关注、应援团和被拦截的消息。"
      />
    );
  }

  const canSend = session.systemType === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Avatar name={session.name} face={session.face} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="truncate text-sm font-semibold hover:text-primary"
              onClick={() => {
                if (session.sessionType === 1 && session.systemType === 0) {
                  navigate(`/up/${session.talkerId}`);
                }
              }}
            >
              {session.name || "用户"}
            </button>
            {session.followed && <Badge>已关注</Badge>}
            {session.live && <Badge variant="ai">直播中</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {session.sessionType === 2
              ? "应援团"
              : session.systemType
                ? "官方会话"
                : "私信"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title={session.pinned ? "取消置顶" : "置顶"}
          onClick={() => {
            const next = !session.pinned;
            void window.biliDesk.bili
              .setChatPinned(session.talkerId, session.sessionType, next)
              .then(() =>
                onPatch(session.talkerId, session.sessionType, {
                  pinned: next,
                }),
              )
              .catch((err) => setError(tidyError(err)));
          }}
        >
          <Pin className={cn("h-4 w-4", session.pinned && "text-primary")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={session.muted ? "取消免打扰" : "免打扰"}
          onClick={() => {
            const next = !session.muted;
            void window.biliDesk.bili
              .setChatMuted(session.talkerId, session.sessionType, next)
              .then(() =>
                onPatch(session.talkerId, session.sessionType, { muted: next }),
              )
              .catch((err) => setError(tidyError(err)));
          }}
        >
          <BellOff className={cn("h-4 w-4", session.muted && "text-primary")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="移除会话"
          onClick={() => setConfirmRemove(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={scroller}
        className="scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottom.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          if (node.scrollTop < 24 && hasMore && !loading) void loadOlder();
        }}
      >
        {hasMore && (
          <p className="text-center text-[11px] text-muted-foreground">
            上滑加载更早的消息
          </p>
        )}
        {messages
          .filter((item) => includesTerm(`${item.text} ${item.title}`, keyword))
          .map((item) => (
            <Bubble
              key={item.seqno || item.msgKey}
              message={item}
              emotes={emotes}
              onOpen={(url) => void openTarget(url, navigate)}
              onPreview={setPreview}
              onRecall={() => {
                void window.biliDesk.bili
                  .recallChatMessage(
                    session.talkerId,
                    session.sessionType,
                    item.msgKey,
                  )
                  .then(() => loadLatest())
                  .catch((err) => setError(tidyError(err)));
              }}
            />
          ))}
        {!loading && messages.length === 0 && !error && (
          <EmptyState title="还没有消息" detail="发一条消息开始聊天。" />
        )}
      </div>
      {error && <p className="px-4 pb-1 text-xs text-destructive">{error}</p>}
      {canSend ? (
        <form
          className="flex items-end gap-2 border-t border-border/60 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="发一条消息，Enter 发送"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            发送
          </Button>
        </form>
      ) : (
        <p className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
          官方会话只接收通知，不能回复
        </p>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title="移除这个会话？"
        description="只从列表里拿掉，聊天记录还在。之后有新消息会再出现。"
        confirmLabel="移除"
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          void window.biliDesk.bili
            .removeChatSession(session.talkerId, session.sessionType)
            .then(() => {
              setConfirmRemove(false);
              onRemoved(session.talkerId, session.sessionType);
            })
            .catch((err) => {
              setConfirmRemove(false);
              setError(tidyError(err));
            });
        }}
      />
      <ImageLightbox
        images={preview ? [preview] : []}
        index={0}
        open={Boolean(preview)}
        onClose={() => setPreview("")}
      />
    </div>
  );
}

function Bubble({
  message,
  emotes,
  onOpen,
  onPreview,
  onRecall,
}: {
  message: ChatMessage;
  emotes: ChatEmote[];
  onOpen: (url: string) => void;
  onPreview: (url: string) => void;
  onRecall: () => void;
}) {
  const recalled = message.status === 1 || message.msgType === 5;
  const note = sourceNote(message.source);
  const canRecall =
    message.mine &&
    !recalled &&
    Boolean(message.msgKey) &&
    Date.now() / 1000 - message.time < 120;
  const card =
    !recalled && (message.title || message.jumpUrl) && message.msgType !== 1;
  return (
    <div className={cn("flex", message.mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[72%]",
          message.mine ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-6",
            recalled
              ? "bg-secondary/60 text-muted-foreground"
              : message.mine
                ? "bg-primary/15 text-foreground"
                : "bg-card text-foreground shadow-sm ring-1 ring-border/60",
          )}
        >
          {recalled ? (
            message.text
          ) : (
            <>
              {message.imageUrl && message.msgType === 2 && (
                <button
                  type="button"
                  onClick={() => onPreview(message.imageUrl)}
                >
                  <BiliImage
                    src={message.imageUrl}
                    alt=""
                    className="mb-1 max-h-52 rounded-lg object-cover"
                  />
                </button>
              )}
              {card ? (
                <button
                  type="button"
                  className="block text-left"
                  onClick={() => message.jumpUrl && onOpen(message.jumpUrl)}
                >
                  {message.cover && (
                    <BiliImage
                      src={message.cover}
                      alt=""
                      className="mb-2 h-24 w-full rounded-lg object-cover"
                    />
                  )}
                  {message.title && (
                    <span className="block font-medium">{message.title}</span>
                  )}
                  {message.text && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <RichText text={message.text} emotes={emotes} />
                    </span>
                  )}
                </button>
              ) : (
                message.text && <RichText text={message.text} emotes={emotes} />
              )}
            </>
          )}
        </div>
        <div
          className={cn(
            "mt-1 flex items-center gap-2 text-[10px] text-muted-foreground",
            message.mine && "justify-end",
          )}
        >
          <span>{formatMessageTime(message.time)}</span>
          {note && <span>{note}</span>}
          {canRecall && (
            <button
              type="button"
              className="hover:text-foreground"
              onClick={onRecall}
            >
              撤回
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedList({
  kind,
  keyword,
  onChanged,
}: {
  kind: MessageFeedKind | "sent";
  keyword: string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<MessageFeedItem[]>([]);
  const [cursorId, setCursorId] = useState(0);
  const [cursorTime, setCursorTime] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyId, setReplyId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [serverKeyword, setServerKeyword] = useState(keyword.trim());

  useEffect(() => {
    if (kind !== "sent") return;
    const timer = window.setTimeout(
      () => setServerKeyword(keyword.trim()),
      280,
    );
    return () => window.clearTimeout(timer);
  }, [keyword, kind]);

  const load = useCallback(
    async (append: boolean, id: number, time: number) => {
      setLoading(true);
      setError("");
      try {
        const page =
          kind === "sent"
            ? await window.biliDesk.bili.getMyReplies(
                append ? id : 0,
                append ? time : 0,
                serverKeyword,
              )
            : await window.biliDesk.bili.getMessageFeed(kind, id, time);
        setItems((current) => {
          if (append) return [...current, ...page.items];
          if (kind !== "sent") return page.items;
          const local = readLocalSent().filter(
            (row) => !page.items.some((item) => item.id === row.id),
          );
          return [...local, ...page.items];
        });
        setCursorId(page.cursorId);
        setCursorTime(page.cursorTime);
        setIsEnd(page.isEnd || (kind !== "sent" && page.items.length === 0));
        if (!append) onChanged();
      } catch (err) {
        setError(tidyError(err));
      } finally {
        setLoading(false);
      }
    },
    [kind, onChanged, serverKeyword],
  );

  useEffect(() => {
    setItems([]);
    void load(false, 0, 0);
  }, [load]);

  const headline = (item: MessageFeedItem) => {
    const names = item.users
      .slice(0, 2)
      .map((user) => user.name)
      .filter(Boolean);
    const who = names.join("、") || "有人";
    const extra =
      item.counts > Math.max(1, names.length) ? ` 等 ${item.counts} 人` : "";
    if (kind === "sent") return "我回复了";
    if (kind === "like") return `${who}${extra} 赞了你`;
    if (kind === "at") return `${who}${extra} @ 了你`;
    return `${who}${extra} 回复了你`;
  };

  const term = keyword.trim();
  const shown = items.filter((item) =>
    includesTerm(
      [
        item.content,
        item.quote,
        item.title,
        item.business,
        ...item.users.map((user) => user.name),
      ].join(" "),
      term,
    ),
  );

  return (
    <div className="scrollbar-overlay h-full overflow-y-auto px-5 py-4">
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {term && !isEnd && (
          <p className="text-center text-[11px] text-muted-foreground">
            {kind === "sent"
              ? "按关键词向服务器查询，未加载完时可继续翻页"
              : "当前只搜索已加载的内容，需要的话先加载更多"}
          </p>
        )}
        {shown.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-border/70 bg-card/40 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex -space-x-2">
                {(item.users.slice(0, 3).length
                  ? item.users.slice(0, 3)
                  : [{ mid: 0, name: "用户", face: "" }]
                ).map((user) => (
                  <button
                    key={`${user.mid}-${user.name}`}
                    type="button"
                    onClick={() => user.mid && navigate(`/up/${user.mid}`)}
                  >
                    <Avatar name={user.name} face={user.face} />
                  </button>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {headline(item)}
                  </p>
                  {item.business && (
                    <Badge variant="secondary">{item.business}</Badge>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatMessageTime(item.time)}
                </p>
                {item.content && (
                  <p className="mt-2 text-sm leading-6">{item.content}</p>
                )}
                {item.quote && (
                  <p className="mt-2 rounded-xl bg-secondary/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {item.quote}
                  </p>
                )}
                {(item.title || item.cover) && (
                  <button
                    type="button"
                    className="mt-3 flex w-full items-center gap-3 rounded-xl bg-secondary/50 p-2 text-left"
                    onClick={() => void openTarget(item.uri, navigate)}
                  >
                    {item.cover && (
                      <BiliImage
                        src={item.cover}
                        alt=""
                        className="h-12 w-20 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="line-clamp-2 text-xs">
                      {item.title || "查看原内容"}
                    </span>
                  </button>
                )}
                <div className="mt-3 flex gap-2">
                  {item.uri && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openTarget(item.uri, navigate)}
                    >
                      查看
                    </Button>
                  )}
                  {canLocate(item) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => locateComment(item, navigate)}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      定位
                    </Button>
                  )}
                  {kind === "reply" &&
                    item.subjectId > 0 &&
                    item.businessId > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyId(item.id);
                          setReplyText("");
                        }}
                      >
                        回复
                      </Button>
                    )}
                  {kind !== "sent" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void window.biliDesk.bili
                          .deleteMessageFeed(kind, item.id)
                          .then(() => {
                            setItems((current) =>
                              current.filter((row) => row.id !== item.id),
                            );
                            onChanged();
                          })
                          .catch((err) => setError(tidyError(err)));
                      }}
                    >
                      删除
                    </Button>
                  )}
                </div>
                {replyId === item.id && (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const text = replyText.trim();
                      if (!text || replying) return;
                      setReplying(true);
                      void window.biliDesk.bili
                        .addTargetComment(
                          String(item.subjectId),
                          item.businessId,
                          text,
                          item.rootId || item.sourceId,
                          item.sourceId || item.rootId,
                        )
                        .then((created) => {
                          const rpid = created?.rpid ?? 0;
                          rememberLocalSent({
                            id: rpid ? String(rpid) : `local-${Date.now()}`,
                            time: Math.floor(Date.now() / 1000),
                            users: [{ mid: 0, name: "我", face: "" }],
                            counts: 1,
                            business: item.business,
                            title: item.title,
                            content: text,
                            quote: item.content,
                            cover: item.cover,
                            uri: item.uri,
                            subjectId: item.subjectId,
                            businessId: item.businessId,
                            rootId: item.rootId || item.sourceId || rpid,
                            sourceId: rpid || item.sourceId || item.rootId,
                          });
                          setReplyId("");
                          setReplyText("");
                        })
                        .catch((err) => setError(tidyError(err)))
                        .finally(() => setReplying(false));
                    }}
                  >
                    <input
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="回复这条评论"
                      className="h-9 flex-1 rounded-lg border border-border bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={replying || !replyText.trim()}
                    >
                      发送
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </article>
        ))}
        {!loading && items.length === 0 && !error && (
          <EmptyState
            title={kind === "sent" ? "还没有可显示的回复" : "这里是空的"}
            detail={
              kind === "sent"
                ? "这里列出别人回复过的、你发出的评论。你在「回复我的」里新写的回复也会出现在这里。"
                : "新的互动会出现在这个列表里。"
            }
          />
        )}
        {!loading && items.length > 0 && shown.length === 0 && !error && (
          <EmptyState
            title="没有匹配的内容"
            detail="换个关键词，或先加载更多再搜。"
          />
        )}
        {!isEnd && items.length > 0 && (
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => void load(true, cursorId, cursorTime)}
          >
            {loading ? "加载中" : "加载更多"}
          </Button>
        )}
        {loading && items.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            正在加载…
          </p>
        )}
      </div>
    </div>
  );
}

function NoticeList({
  keyword,
  onChanged,
}: {
  keyword: string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<SystemNotice[]>([]);
  const [cursor, setCursor] = useState("");
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (append: boolean, nextCursor: string) => {
      setLoading(true);
      setError("");
      try {
        const page = await window.biliDesk.bili.getSystemNotices(nextCursor);
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.cursor);
        setIsEnd(page.isEnd);
        if (!append) onChanged();
      } catch (err) {
        setError(tidyError(err));
      } finally {
        setLoading(false);
      }
    },
    [onChanged],
  );

  useEffect(() => {
    void load(false, "");
  }, [load]);

  const term = keyword.trim();
  const shown = items.filter((item) =>
    includesTerm(`${item.title} ${item.content} ${item.sourceName}`, term),
  );

  return (
    <div className="scrollbar-overlay h-full overflow-y-auto px-5 py-4">
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {term && !isEnd && (
          <p className="text-center text-[11px] text-muted-foreground">
            当前只搜索已加载的通知，需要的话先加载更多
          </p>
        )}
        {shown.map((item) => (
          <article
            key={item.id || item.cursor || item.title}
            className="rounded-2xl border border-border/70 bg-card/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">{item.title}</h4>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {[
                    item.sourceName,
                    item.timeText || formatMessageTime(item.time),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
            </div>
            {item.content && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {item.content}
              </p>
            )}
            {item.uri && (
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => void openTarget(item.uri, navigate)}
              >
                打开
              </Button>
            )}
          </article>
        ))}
        {!loading && items.length === 0 && !error && (
          <EmptyState
            title="没有系统通知"
            detail="审核、活动和其他官方通知会显示在这里。"
          />
        )}
        {!loading && items.length > 0 && shown.length === 0 && !error && (
          <EmptyState
            title="没有匹配的通知"
            detail="换个关键词，或先加载更多再搜。"
          />
        )}
        {!isEnd && items.length > 0 && (
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => void load(true, cursor)}
          >
            {loading ? "加载中" : "加载更多"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<MessageSettings | null>(null);
  const [error, setError] = useState("");
  const [word, setWord] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setSettings(await window.biliDesk.bili.getMessageSettings());
    } catch (err) {
      setError(tidyError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (
    key: "msgNotify" | "showUnfollowed" | "foldUnfollowed" | "foldGroup",
  ) => {
    if (!settings || saving) return;
    const next = !settings[key];
    setSaving(true);
    setSettings({ ...settings, [key]: next });
    void window.biliDesk.bili
      .setMessageSettings({ [key]: next })
      .then(setSettings)
      .catch((err) => {
        setError(tidyError(err));
        void load();
      })
      .finally(() => setSaving(false));
  };

  if (!settings && !error) {
    return (
      <p className="px-6 py-10 text-sm text-muted-foreground">正在读取设置…</p>
    );
  }

  const rows: Array<{
    key: "msgNotify" | "showUnfollowed" | "foldUnfollowed" | "foldGroup";
    title: string;
    detail: string;
  }> = [
    {
      key: "msgNotify",
      title: "消息提醒",
      detail: "关闭后，新私信不再推送提醒。",
    },
    {
      key: "showUnfollowed",
      title: "接收未关注人消息",
      detail: "关闭后，未关注的人不能再给你发私信。",
    },
    {
      key: "foldUnfollowed",
      title: "折叠未关注人消息",
      detail: "未关注人的会话收进单独分组，不打乱主列表。",
    },
    {
      key: "foldGroup",
      title: "折叠应援团消息",
      detail: "应援团会话折叠显示，避免刷屏。",
    },
  ];

  return (
    <div className="scrollbar-overlay h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {settings &&
          rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => toggle(row.key)}
              className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/40 px-4 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{row.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {row.detail}
                </span>
              </span>
              <span
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  settings[row.key] ? "bg-primary" : "bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                    settings[row.key] ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>
          ))}
        {settings && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <h4 className="text-sm font-medium">屏蔽词</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              命中这些词的私信会被拦截。每个词最多 20 个字。
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = word.trim();
                if (!next) return;
                setSaving(true);
                void window.biliDesk.bili
                  .addMessageBlockWord(next)
                  .then((words) => {
                    setWord("");
                    setSettings((current) =>
                      current ? { ...current, blockWords: words } : current,
                    );
                  })
                  .catch((err) => setError(tidyError(err)))
                  .finally(() => setSaving(false));
              }}
            >
              <input
                value={word}
                maxLength={20}
                onChange={(event) => setWord(event.target.value)}
                placeholder="添加屏蔽词"
                className="h-9 flex-1 rounded-lg border border-border bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="submit" size="sm" disabled={saving || !word.trim()}>
                添加
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {settings.blockWords.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  还没有屏蔽词
                </span>
              )}
              {settings.blockWords.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs hover:bg-destructive/15"
                  onClick={() => {
                    void window.biliDesk.bili
                      .removeMessageBlockWord(item)
                      .then((words) =>
                        setSettings((current) =>
                          current ? { ...current, blockWords: words } : current,
                        ),
                      )
                      .catch((err) => setError(tidyError(err)));
                  }}
                >
                  {item} ×
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
