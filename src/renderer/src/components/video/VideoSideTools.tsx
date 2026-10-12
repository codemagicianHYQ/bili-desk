import { useEffect, useState } from "react";
import type { ArchiveNote } from "@shared/types";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";

export function VideoSideTools({
  bvid,
  aid,
  cid,
  qn,
  onSeek,
}: {
  bvid: string;
  aid: number;
  cid: number;
  qn?: number;
  onSeek: (time: number) => void;
}) {
  const [heat, setHeat] = useState<number[]>([]);
  const [notes, setNotes] = useState<ArchiveNote[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setHeat([]);
    void window.biliDesk.bili
      .getVideoHeatmap(bvid, cid)
      .then((points) => {
        if (!cancelled) setHeat(points);
      })
      .catch(() => {
        if (!cancelled) setHeat([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, cid]);

  useEffect(() => {
    if (!aid) return;
    let cancelled = false;
    void window.biliDesk.bili
      .getArchiveNotes(aid)
      .then((list) => {
        if (!cancelled) setNotes(list);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [aid]);

  const saveNote = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    setTip("");
    try {
      await window.biliDesk.bili.addArchiveNote(aid, title, text);
      setTitle("");
      setText("");
      setTip("笔记已保存");
      setNotes(await window.biliDesk.bili.getArchiveNotes(aid));
    } catch (err) {
      setError(extractIpcErrorMessage(err) || "保存笔记失败");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setError("");
    setTip("");
    try {
      const saved = await window.biliDesk.bili.downloadVideo(bvid, cid, qn);
      if (saved) setTip("已开始保存到你选择的位置");
    } catch (err) {
      setError(extractIpcErrorMessage(err) || "下载失败");
    }
  };

  return (
    <div className="space-y-3">
      {heat.length > 1 && (
        <button
          type="button"
          className="flex h-8 w-full items-end gap-px overflow-hidden rounded-md bg-secondary px-1"
          title="高能进度条，点击跳转"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            const video = document.querySelector("video");
            const duration = video?.duration ?? 0;
            if (duration > 0) onSeek(ratio * duration);
          }}
        >
          {heat.map((value, index) => (
            <span
              key={index}
              className="min-w-0 flex-1 rounded-sm bg-primary"
              style={{ height: `${Math.max(8, Math.round(value * 100))}%` }}
            />
          ))}
        </button>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          下载会保存当前能直接播放的文件。1080P 分段画质需要先调低清晰度。
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void download()}>
          下载
        </Button>
      </div>
      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-sm font-medium">播放笔记</p>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="标题"
          className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none"
        />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="写给自己的笔记"
          className="min-h-16 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none"
        />
        <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={() => void saveNote()}>
          保存笔记
        </Button>
        {notes.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {notes.map((note) => (
              <li key={note.id}>
                <span className="text-foreground">{note.title}</span>
                {note.summary ? ` · ${note.summary}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tip && <p className="text-xs text-muted-foreground">{tip}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
