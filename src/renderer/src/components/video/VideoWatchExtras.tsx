import { useEffect, useMemo, useState } from "react";
import type {
  DanmakuFilterKind,
  DanmakuItem,
  VideoChapter,
} from "@shared/types";
import { midHashOf } from "@/components/video/danmaku-match";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatDuration } from "@/lib/utils";
import { Loader2, X } from "lucide-react";

export function VideoWatchExtras({
  bvid,
  cid,
  onSeek,
}: {
  bvid: string;
  cid: number;
  onSeek: (time: number) => void;
}) {
  const [chapters, setChapters] = useState<VideoChapter[]>([]);
  const [filters, setFilters] = useState<
    Array<{ id: number; text: string; kind: DanmakuFilterKind }>
  >([]);
  const [kind, setKind] = useState<DanmakuFilterKind>("text");
  const [word, setWord] = useState("");
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const selfMid = useAppStore((state) => state.user?.mid ?? 0);
  const selfHash = selfMid > 0 ? midHashOf(selfMid) : "";
  const [filterError, setFilterError] = useState("");
  const [filterTip, setFilterTip] = useState("");
  const [danmakuOpen, setDanmakuOpen] = useState(false);
  const [danmaku, setDanmaku] = useState<DanmakuItem[]>([]);
  const [danmakuLoading, setDanmakuLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [historyMonth, setHistoryMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [historyDate, setHistoryDate] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [latestDanmaku, setLatestDanmaku] = useState<DanmakuItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setChapters([]);
    void window.biliDesk.bili
      .getVideoChapters(bvid, cid)
      .then((list) => {
        if (!cancelled) setChapters(list);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      });
    void window.biliDesk.bili
      .getDanmakuFilters()
      .then((list) => {
        if (!cancelled) setFilters(list);
      })
      .catch(() => {
        if (!cancelled) setFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, cid]);

  const visibleDanmaku = useMemo(() => {
    const term = query.trim();
    const source = term
      ? danmaku.filter((item) => item.text.includes(term))
      : danmaku;
    return source.slice(0, 40);
  }, [danmaku, query]);

  const addFilter = async () => {
    const text = word.trim();
    if (!text) return;
    setFilterError("");
    try {
      await window.biliDesk.bili.addDanmakuFilter(text, kind);
      setWord("");
      setFilters(await window.biliDesk.bili.getDanmakuFilters());
    } catch (err) {
      setFilterError(extractIpcErrorMessage(err) || "添加屏蔽词失败");
    }
  };

  const loadDanmaku = async () => {
    if (danmakuOpen) {
      setDanmakuOpen(false);
      return;
    }
    setDanmakuOpen(true);
    if (danmaku.length > 0) return;
    setDanmakuLoading(true);
    try {
      const list = await window.biliDesk.bili.getDanmakuList(cid);
      setDanmaku(list);
      setLatestDanmaku(list);
    } catch (err) {
      setFilterError(extractIpcErrorMessage(err) || "弹幕加载失败");
    } finally {
      setDanmakuLoading(false);
    }
  };

  useEffect(() => {
    setHistoryDates([]);
    setHistoryDate("");
    setHistoryError("");
    setLatestDanmaku([]);
    setDanmaku([]);
    setDanmakuOpen(false);
  }, [cid]);

  const loadHistoryMonth = async (month: string) => {
    setHistoryMonth(month);
    setHistoryDates([]);
    setHistoryError("");
    if (!month) return;
    try {
      const dates = await window.biliDesk.bili.getDanmakuHistoryDates(
        cid,
        month,
      );
      setHistoryDates(dates);
      if (dates.length === 0) setHistoryError("这个月没有历史弹幕");
    } catch (err) {
      setHistoryError(extractIpcErrorMessage(err) || "历史弹幕日期获取失败");
    }
  };

  const loadHistoryDate = async (date: string) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setDanmaku(await window.biliDesk.bili.getDanmakuHistory(cid, date));
      setHistoryDate(date);
    } catch (err) {
      setHistoryError(extractIpcErrorMessage(err) || "历史弹幕获取失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  const backToLatest = () => {
    setHistoryDate("");
    setDanmaku(latestDanmaku);
  };

  return (
    <div className="space-y-3">
      {chapters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chapters.map((chapter) => (
            <button
              key={`${chapter.from}-${chapter.content}`}
              type="button"
              className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onSeek(chapter.from)}
            >
              {formatDuration(chapter.from)} {chapter.content}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder={
              kind === "user"
                ? "屏蔽用户 UID"
                : kind === "regex"
                  ? "屏蔽正则，如 .{20,}"
                  : "添加弹幕屏蔽词"
            }
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addFilter();
              }
            }}
          />
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as DanmakuFilterKind)
            }
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            <option value="text">文字</option>
            <option value="regex">正则</option>
            <option value="user">用户</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void addFilter()}
          >
            屏蔽
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void loadDanmaku()}
          >
            {danmakuOpen ? "收起弹幕" : "弹幕列表 / 历史弹幕"}
          </Button>
        </div>
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
              >
                {item.kind === "regex"
                  ? "正则 "
                  : item.kind === "user"
                    ? "用户 "
                    : ""}
                {item.text}
                <button
                  type="button"
                  aria-label="删除屏蔽词"
                  onClick={() => {
                    void window.biliDesk.bili
                      .removeDanmakuFilter(item.id)
                      .then(() =>
                        setFilters((prev) =>
                          prev.filter((entry) => entry.id !== item.id),
                        ),
                      )
                      .catch((err) =>
                        setFilterError(
                          extractIpcErrorMessage(err) || "删除失败",
                        ),
                      );
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          屏蔽词会在下次打开这个视频时生效。
        </p>
        {filterError && <p className="text-xs text-red-400">{filterError}</p>}
        {filterTip && (
          <p className="text-xs text-muted-foreground">{filterTip}</p>
        )}

        {danmakuOpen && (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索这条视频的弹幕"
              className="mb-2 h-8 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none"
            />
            <div className="mb-2 space-y-1.5 rounded-lg bg-secondary/40 p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>历史弹幕</span>
                <input
                  type="month"
                  value={historyMonth}
                  max={new Date().toISOString().slice(0, 7)}
                  onChange={(event) =>
                    void loadHistoryMonth(event.target.value)
                  }
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                />
                {historyDates.length === 0 && !historyError && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => void loadHistoryMonth(historyMonth)}
                  >
                    查看有记录的日期
                  </button>
                )}
                {historyDate && (
                  <>
                    <span className="text-foreground">
                      正在看 {historyDate} 的弹幕
                    </span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={backToLatest}
                    >
                      回到最新
                    </button>
                  </>
                )}
                {historyLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              {historyDates.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {historyDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      disabled={historyLoading}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs transition-colors",
                        date === historyDate
                          ? "bg-primary/20 text-primary"
                          : "bg-background text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => void loadHistoryDate(date)}
                    >
                      {date.slice(5)}
                    </button>
                  ))}
                </div>
              )}
              {historyError && (
                <p className="text-xs text-muted-foreground">{historyError}</p>
              )}
            </div>
            {danmakuLoading ? (
              <p className="flex items-center text-xs text-muted-foreground">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                加载弹幕...
              </p>
            ) : visibleDanmaku.length === 0 ? (
              <p className="text-xs text-muted-foreground">没有可操作的弹幕</p>
            ) : (
              visibleDanmaku.map((item, index) => (
                <div
                  key={`${item.id ?? "dm"}-${item.time}-${index}`}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs"
                >
                  <span className="w-12 shrink-0 text-muted-foreground">
                    {formatDuration(item.time)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.text}</span>
                  {item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        className="text-muted-foreground hover:text-pink-400"
                        onClick={() => {
                          const id = item.id;
                          if (!id) return;
                          const next = !likedIds.has(id);
                          setBusyId(id);
                          void window.biliDesk.bili
                            .likeDanmaku(cid, id, next)
                            .then(() =>
                              setLikedIds((prev) => {
                                const copy = new Set(prev);
                                if (next) copy.add(id);
                                else copy.delete(id);
                                return copy;
                              }),
                            )
                            .catch((err) =>
                              setFilterError(
                                extractIpcErrorMessage(err) || "点赞失败",
                              ),
                            )
                            .finally(() => setBusyId(""));
                        }}
                      >
                        {likedIds.has(item.id) ? "取消赞" : "赞"}
                      </button>
                      {selfHash &&
                        item.midHash &&
                        item.midHash.toLowerCase() === selfHash && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const id = item.id;
                              if (!id) return;
                              setBusyId(id);
                              void window.biliDesk.bili
                                .recallDanmaku(cid, id)
                                .then((message) => {
                                  setFilterError("");
                                  setFilterTip(message || "已撤回");
                                })
                                .catch((err) =>
                                  setFilterError(
                                    extractIpcErrorMessage(err) || "撤回失败",
                                  ),
                                )
                                .finally(() => setBusyId(""));
                            }}
                          >
                            撤回
                          </button>
                        )}
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        className="text-muted-foreground hover:text-red-400"
                        onClick={() => {
                          const id = item.id;
                          if (!id) return;
                          setBusyId(id);
                          void window.biliDesk.bili
                            .reportDanmaku(cid, id, 11)
                            .catch((err) =>
                              setFilterError(
                                extractIpcErrorMessage(err) || "举报失败",
                              ),
                            )
                            .finally(() => setBusyId(""));
                        }}
                      >
                        举报
                      </button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
