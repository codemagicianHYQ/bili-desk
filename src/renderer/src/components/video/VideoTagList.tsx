import { BookOpen, ChevronRight, Hash, Music } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { VideoTag } from "@shared/types";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn } from "@/lib/utils";

function resolveTagHref(tag: VideoTag): string {
  const jump = tag.jumpUrl?.trim();
  if (jump) {
    return jump.startsWith("//") ? `https:${jump}` : jump;
  }
  if (tag.kind === "topic" && tag.id > 0) {
    return `https://www.bilibili.com/v/topic/detail/?topic_id=${tag.id}`;
  }
  if (tag.id > 0) return `https://www.bilibili.com/tag/${tag.id}`;
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(tag.name)}`;
}

function TagIcon({ kind }: { kind: VideoTag["kind"] }) {
  if (kind === "topic") return <Hash className="h-3 w-3 text-sky-400" />;
  if (kind === "channel") return <BookOpen className="h-3 w-3 text-sky-400" />;
  if (kind === "bgm") return <Music className="h-3 w-3 text-sky-400" />;
  return null;
}

export function VideoTagList({ tags }: { tags?: VideoTag[] }) {
  const navigate = useNavigate();
  if (!tags?.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => {
        const featured = tag.kind !== "normal" || Boolean(tag.jumpUrl);
        return (
          <button
            key={`${tag.kind}-${tag.id}-${tag.name}`}
            type="button"
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1",
              "text-xs text-muted-foreground transition-colors",
              "hover:bg-secondary/80 hover:text-foreground",
            )}
            title={tag.name}
            onClick={() => void openBiliHref(resolveTagHref(tag), navigate)}
          >
            <TagIcon kind={tag.kind} />
            <span className="truncate">{tag.name}</span>
            {featured ? (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-55" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
