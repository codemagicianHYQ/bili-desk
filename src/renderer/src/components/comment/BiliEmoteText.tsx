import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import type { CommentMember } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { ExternalTextLink } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils";
import { splitLinkifiedText } from "@shared/utils/external-url";

/** 评论 / 动态里的 `[doge]` 一类转义符 */
const EMOTE_TOKEN_RE = /(\[[^[\]]{1,32}\])/g;

interface BiliEmoteTextProps {
  text: string;
  emotes?: Record<string, string>;
  mentions?: CommentMember[];
  className?: string;
  /** 表情显示尺寸（px） */
  size?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitMentionedText(
  text: string,
  mentions: CommentMember[] | undefined,
): Array<
  | { kind: "text"; value: string }
  | { kind: "mention"; value: string; mid: number }
> {
  if (!text) return [];
  const usable = (mentions ?? [])
    .filter((item) => item.mid > 0 && item.name.trim())
    .sort((a, b) => b.name.length - a.name.length);
  if (usable.length === 0) return [{ kind: "text", value: text }];

  const lookup = new Map<string, number>();
  for (const item of usable) {
    const token = `@${item.name}`;
    if (!lookup.has(token)) lookup.set(token, item.mid);
  }

  const pattern = [...lookup.keys()]
    .map((token) => escapeRegExp(token))
    .join("|");
  if (!pattern) return [{ kind: "text", value: text }];

  const parts = text.split(new RegExp(`(${pattern})`, "g"));
  return parts.filter(Boolean).map((part) => {
    const mid = lookup.get(part);
    return mid
      ? { kind: "mention" as const, value: part, mid }
      : { kind: "text" as const, value: part };
  });
}

export function BiliEmoteText({
  text,
  emotes,
  mentions,
  className,
  size = 20,
}: BiliEmoteTextProps) {
  const parts = useMemo(() => {
    if (!text) return [];
    return text.split(EMOTE_TOKEN_RE);
  }, [text]);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => {
        if (!part) return null;
        const url = emotes?.[part];
        if (url && part.startsWith("[") && part.endsWith("]")) {
          return (
            <BiliImage
              key={`${part}-${index}`}
              src={url}
              alt={part}
              title={part}
              className="mx-0.5 inline-block align-text-bottom object-contain"
              style={{ width: size, height: size }}
            />
          );
        }
        return (
          <Fragment key={`t-${index}`}>
            {splitMentionedText(part, mentions).map(
              (mentionPart, mentionIndex) =>
                mentionPart.kind === "mention" ? (
                  <Link
                    key={`m-${index}-${mentionIndex}`}
                    to={`/up/${mentionPart.mid}`}
                    className="text-[#00AEEC] hover:underline"
                  >
                    {mentionPart.value}
                  </Link>
                ) : (
                  <Fragment key={`s-${index}-${mentionIndex}`}>
                    {splitLinkifiedText(mentionPart.value).map(
                      (piece, pieceIndex) =>
                        piece.kind === "url" ? (
                          <ExternalTextLink
                            key={`u-${index}-${mentionIndex}-${pieceIndex}`}
                            href={piece.href}
                          >
                            {piece.value}
                          </ExternalTextLink>
                        ) : (
                          <Fragment
                            key={`p-${index}-${mentionIndex}-${pieceIndex}`}
                          >
                            {piece.value}
                          </Fragment>
                        ),
                    )}
                  </Fragment>
                ),
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
