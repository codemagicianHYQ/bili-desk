import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { VideoAiSummary } from "@shared/types";
import { cn, formatDuration } from "@/lib/utils";

export function VideoAiSummaryCard({
  bvid,
  cid,
  upMid,
  onSeek,
}: {
  bvid: string;
  cid: number;
  upMid: number;
  onSeek: (time: number) => void;
}) {
  const [data, setData] = useState<VideoAiSummary | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setExpanded(false);
    void window.biliDesk.bili
      .getVideoAiSummary(bvid, cid, upMid)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, cid, upMid]);

  if (!data) return null;
  const hasOutline = data.outline.length > 0;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-sm font-medium"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <Sparkles className="h-4 w-4 text-sky-400" />
        <span className="flex-1">AI 视频总结</span>
        {hasOutline && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      {data.summary && (
        <p
          className={cn(
            "text-sm leading-relaxed text-muted-foreground",
            !expanded && "line-clamp-3",
          )}
        >
          {data.summary}
        </p>
      )}

      {expanded && hasOutline && (
        <div className="space-y-3 pt-1">
          {data.outline.map((section) => (
            <div
              key={`${section.timestamp}-${section.title}`}
              className="space-y-1"
            >
              <button
                type="button"
                className="flex items-center gap-2 text-left text-sm font-medium hover:text-primary"
                onClick={() => onSeek(section.timestamp)}
              >
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-sky-400">
                  {formatDuration(section.timestamp)}
                </span>
                {section.title}
              </button>
              {section.points.map((point) => (
                <button
                  key={`${point.timestamp}-${point.content}`}
                  type="button"
                  className="flex w-full items-start gap-2 pl-2 text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onSeek(point.timestamp)}
                >
                  <span className="shrink-0 font-mono text-sky-400/80">
                    {formatDuration(point.timestamp)}
                  </span>
                  <span>{point.content}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
