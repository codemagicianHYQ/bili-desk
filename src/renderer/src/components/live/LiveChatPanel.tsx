import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LiveChatMessage } from "@shared/types";
import { mergeLiveEmoteMaps } from "@shared/utils/live-danmu-emotes";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { connectLiveDanmu, type LiveDanmuStats } from "@/lib/live-danmu-socket";
import { useAppStore } from "@/stores/app-store";
import { cn, formatCount } from "@/lib/utils";
import { Loader2, Users } from "lucide-react";

const MAX_MESSAGES = 280;

interface LiveChatPanelProps {
  roomId: number;
  viewers?: number;
  active?: boolean;
  onStats?: (stats: LiveDanmuStats) => void;
  className?: string;
}

export function LiveChatPanel({
  roomId,
  viewers = 0,
  active = true,
  onStats,
  className,
}: LiveChatPanelProps) {
  const user = useAppStore((s) => s.user);
  const loggedIn = Boolean(user?.isLogin);
  const listRef = useRef<HTMLDivElement>(null);
  const pinBottomRef = useRef(true);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const seenRef = useRef(new Set<string>());
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [roomEmotes, setRoomEmotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"connecting" | "live" | "closed">(
    "connecting",
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const mergeMessages = useCallback((incoming: LiveChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const item of incoming) {
        const key = `${item.kind}:${item.uid}:${item.text}`;
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key);
        next.push(item);
      }
      next.sort((a, b) => a.time - b.time);
      return next.length > MAX_MESSAGES
        ? next.slice(next.length - MAX_MESSAGES)
        : next;
    });
  }, []);

  useEffect(() => {
    if (!roomId || !active) {
      setMessages([]);
      seenRef.current.clear();
      setRoomEmotes({});
      return;
    }
    let disposed = false;
    let stopSocket: (() => void) | undefined;
    let pollTimer: number | null = null;
    let waitTimer: number | null = null;

    const pullHistory = async () => {
      try {
        const history = await window.biliDesk.bili.getLiveDanmuHistory(roomId);
        if (!disposed) mergeMessages(history);
      } catch {
        // 历史失败不挡实时
      }
    };

    waitTimer = window.setTimeout(() => {
      if (!disposed) setStatus("closed");
    }, 4000);

    void window.biliDesk.bili
      .getLiveEmotes(roomId)
      .then((map) => {
        if (!disposed) setRoomEmotes(map);
      })
      .catch(() => {
        // 表情表失败不影响弹幕
      });

    // 先拉历史，不要等 WebSocket
    void pullHistory();
    pollTimer = window.setInterval(() => {
      void pullHistory();
    }, 2500);

    void (async () => {
      try {
        const info = await window.biliDesk.bili.getLiveDanmuInfo(roomId);
        if (disposed) return;
        let live = false;
        stopSocket = connectLiveDanmu({
          roomId,
          info,
          onMessage: (item) => mergeMessages([item]),
          onStats: (stats) => onStatsRef.current?.(stats),
          onStatus: (next) => {
            if (next === "live") {
              live = true;
              if (waitTimer != null) window.clearTimeout(waitTimer);
              setStatus("live");
              return;
            }
            if (next === "connecting") return;
            if (!live) setStatus("closed");
          },
        });
      } catch (err) {
        if (disposed) return;
        setStatus("closed");
        setError(
          err instanceof Error
            ? err.message
            : "实时弹幕连接失败，正在轮询历史弹幕",
        );
      }
    })();

    return () => {
      disposed = true;
      stopSocket?.();
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (waitTimer != null) window.clearTimeout(waitTimer);
    };
  }, [roomId, active, mergeMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !pinBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!loggedIn) {
      setError("请先登录后再发送弹幕");
      return;
    }
    setSending(true);
    setError("");
    try {
      await window.biliDesk.bili.sendLiveDanmu(roomId, text);
      setDraft("");
      mergeMessages([
        {
          id: `me-${Date.now()}`,
          kind: "danmu",
          uid: user?.mid ?? 0,
          uname: user?.name || "我",
          text,
          time: Date.now(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-border bg-card/40",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Users className="h-4 w-4" />
          房间观众
          <span className="tabular-nums text-muted-foreground">
            ({formatCount(viewers)})
          </span>
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {status === "live"
            ? "实时"
            : status === "connecting"
              ? "连接中"
              : "轮询"}
        </span>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        onScroll={(event) => {
          const el = event.currentTarget;
          pinBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {status === "connecting" ? "正在拉取弹幕…" : "还没有弹幕"}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((item) => {
              const emotes = mergeLiveEmoteMaps(roomEmotes, item.emotes);
              return (
                <li key={item.id} className="text-[13px] leading-5">
                  {item.uid > 0 ? (
                    <Link
                      to={`/up/${item.uid}`}
                      className="mr-1.5 text-[#00AEEC] hover:underline"
                    >
                      {item.uname}
                    </Link>
                  ) : (
                    <span className="mr-1.5 text-[#00AEEC]">{item.uname}</span>
                  )}
                  {item.kind === "enter" ? (
                    <span className="text-muted-foreground">{item.text}</span>
                  ) : item.stickerUrl && !item.text.includes("[") ? (
                    <BiliImage
                      src={item.stickerUrl}
                      alt={item.text}
                      className="inline-block h-7 w-7 align-text-bottom object-contain"
                    />
                  ) : (
                    <BiliEmoteText
                      text={item.text}
                      emotes={emotes}
                      size={20}
                      className="text-foreground"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-border p-2.5">
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            rows={2}
            maxLength={80}
            placeholder={loggedIn ? "发条弹幕吧" : "登录后可发送弹幕"}
            disabled={!loggedIn || sending}
            className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!loggedIn || sending || !draft.trim()}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "发送"}
          </Button>
        </div>
      </div>
    </aside>
  );
}
