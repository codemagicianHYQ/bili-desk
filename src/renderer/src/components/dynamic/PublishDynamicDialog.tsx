import { useEffect, useState } from "react";
import type { DynamicMention, DynamicPublishOptions, TopicSuggest } from "@shared/types";
import { CommentImagePicker } from "@/components/comment/CommentImagePicker";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { Button } from "@/components/ui/button";
import { OverlayPortal, APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";

export function PublishDynamicDialog({
  open,
  onClose,
  onPublished,
  editId,
  initialText = "",
  keepImages = [],
}: {
  open: boolean;
  onClose: () => void;
  onPublished?: (id: string) => void;
  editId?: string;
  initialText?: string;
  keepImages?: string[];
}) {
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [privatePub, setPrivatePub] = useState(false);
  const [closeComment, setCloseComment] = useState(false);
  const [timer, setTimer] = useState("");
  const [mentions, setMentions] = useState<DynamicMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionHits, setMentionHits] = useState<DynamicMention[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicHits, setTopicHits] = useState<TopicSuggest[]>([]);
  const [topic, setTopic] = useState<TopicSuggest | null>(null);
  const [voteTitle, setVoteTitle] = useState("");
  const [voteOptions, setVoteOptions] = useState("");
  const [lotteryPrize, setLotteryPrize] = useState("");
  const [lotteryFollow, setLotteryFollow] = useState(true);
  const [reserveTitle, setReserveTitle] = useState("");
  const [reserveTime, setReserveTime] = useState("");

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setFiles([]);
    setError("");
    setMore(false);
    setPrivatePub(false);
    setCloseComment(false);
    setTimer("");
    setMentions([]);
    setMentionQuery("");
    setMentionHits([]);
    setTopicQuery("");
    setTopicHits([]);
    setTopic(null);
    setVoteTitle("");
    setVoteOptions("");
    setLotteryPrize("");
    setLotteryFollow(true);
    setReserveTitle("");
    setReserveTime("");
  }, [open, editId, initialText]);

  if (!open) return null;

  const editing = Boolean(editId);

  const searchMention = async () => {
    const term = mentionQuery.trim();
    if (!term) return;
    const page = await window.biliDesk.bili.searchUsers(term, 1);
    setMentionHits(
      page.users.slice(0, 6).map((user) => ({ mid: user.mid, name: user.name })),
    );
  };

  const searchTopic = async () => {
    setTopicHits(await window.biliDesk.bili.searchTopics(topicQuery));
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const images = await imageFilesToPayload(files);
      const options: DynamicPublishOptions = {};
      if (privatePub) options.privatePub = true;
      if (closeComment) options.closeComment = true;
      if (timer) {
        const stamp = Math.floor(new Date(timer).getTime() / 1000);
        if (Number.isFinite(stamp) && stamp > Math.floor(Date.now() / 1000)) {
          options.timerPubTime = stamp;
        }
      }
      if (mentions.length > 0) options.mentions = mentions;
      if (topic) options.topic = topic;
      if (keepImages.length > 0) options.keepImages = keepImages;
      const voteLines = voteOptions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (voteTitle.trim() && voteLines.length >= 2) {
        options.vote = {
          title: voteTitle.trim(),
          options: voteLines,
          durationHours: 24,
          choiceCount: 1,
        };
      }
      if (lotteryPrize.trim()) {
        options.lottery = {
          prize: lotteryPrize.trim(),
          durationHours: 24,
          needFollow: lotteryFollow,
        };
      }
      if (reserveTitle.trim() && reserveTime) {
        const startTs = Math.floor(new Date(reserveTime).getTime() / 1000);
        if (Number.isFinite(startTs)) {
          options.reserve = { title: reserveTitle.trim(), startTs };
        }
      }
      if (editing && editId) {
        await window.biliDesk.bili.editDynamic(editId, text, images, options);
        onPublished?.(editId);
      } else {
        const created = await window.biliDesk.bili.createDynamic(
          text,
          images,
          options,
        );
        onPublished?.(created.id);
      }
      onClose();
    } catch (err) {
      setError(extractIpcErrorMessage(err) || (editing ? "保存失败" : "发布失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayPortal>
      <div
        className={cn(
          "fixed inset-0 flex items-center justify-center bg-black/55 p-4",
          APP_OVERLAY_ZCLASS,
        )}
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 className="text-base font-semibold">
            {editing ? "编辑动态" : "发动态"}
          </h2>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 1000))}
            rows={5}
            placeholder="分享新鲜事，@ 和 #话题# 会按你选中的人、话题发出"
            className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <div className="mt-3">
            <CommentImagePicker
              files={files}
              onChange={setFiles}
              max={9}
              disabled={busy}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {text.trim().length}/1000 · 最多 9 张图
              {keepImages.length > 0 ? ` · 保留原图 ${keepImages.length} 张` : ""}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={privatePub}
                onChange={(event) => setPrivatePub(event.target.checked)}
              />
              仅自己可见
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={closeComment}
                onChange={(event) => setCloseComment(event.target.checked)}
              />
              关闭评论
            </label>
            <label className="inline-flex items-center gap-1">
              定时
              <input
                type="datetime-local"
                value={timer}
                onChange={(event) => setTimer(event.target.value)}
                className="rounded border border-border bg-background px-1 py-0.5"
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 text-xs text-primary"
            onClick={() => setMore((value) => !value)}
          >
            {more ? "收起 @ / 话题 / 投票" : "@ 人、话题、投票、抽奖、预约"}
          </button>
          {more && (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="flex gap-2">
                  <input
                    value={mentionQuery}
                    onChange={(event) => setMentionQuery(event.target.value)}
                    placeholder="搜索要 @ 的人"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => void searchMention()}>
                    搜索
                  </Button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {mentionHits.map((user) => (
                    <button
                      key={user.mid}
                      type="button"
                      className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                      onClick={() => {
                        setMentions((prev) =>
                          prev.some((item) => item.mid === user.mid)
                            ? prev
                            : [...prev, user],
                        );
                        setText((prev) => `${prev}@${user.name} `);
                      }}
                    >
                      @{user.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex gap-2">
                  <input
                    value={topicQuery}
                    onChange={(event) => setTopicQuery(event.target.value)}
                    placeholder="搜索话题"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => void searchTopic()}>
                    搜索
                  </Button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {topicHits.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                      onClick={() => {
                        setTopic(item);
                        setText((prev) =>
                          prev.includes(`#${item.name}#`)
                            ? prev
                            : `${prev}#${item.name}# `,
                        );
                      }}
                    >
                      #{item.name}
                    </button>
                  ))}
                </div>
                {topic && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    已选话题 #{topic.name}
                  </p>
                )}
              </div>
              {!editing && (
                <>
                  <input
                    value={voteTitle}
                    onChange={(event) => setVoteTitle(event.target.value)}
                    placeholder="投票标题，下面一行一个选项"
                    className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <textarea
                    value={voteOptions}
                    onChange={(event) => setVoteOptions(event.target.value)}
                    rows={3}
                    placeholder={"选项一\n选项二"}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
                  />
                  <input
                    value={lotteryPrize}
                    onChange={(event) => setLotteryPrize(event.target.value)}
                    placeholder="抽奖奖品，留空则不抽奖"
                    className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={lotteryFollow}
                      onChange={(event) => setLotteryFollow(event.target.checked)}
                    />
                    抽奖需要关注
                  </label>
                  <input
                    value={reserveTitle}
                    onChange={(event) => setReserveTitle(event.target.value)}
                    placeholder="直播预约标题"
                    className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={reserveTime}
                    onChange={(event) => setReserveTime(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                </>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button
              disabled={
                busy ||
                (!text.trim() && files.length === 0 && keepImages.length === 0)
              }
              onClick={() => void submit()}
            >
              {busy ? "提交中..." : editing ? "保存" : "发布"}
            </Button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
