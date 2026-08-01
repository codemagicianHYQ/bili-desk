import { Fragment, useMemo } from "react";
import { BiliImage } from "@/components/ui/bili-image";
import { cn } from "@/lib/utils";

/** 评论 / 动态里的 `[doge]` 一类转义符 */
const EMOTE_TOKEN_RE = /(\[[^[\]]{1,32}\])/g;

interface BiliEmoteTextProps {
  text: string;
  emotes?: Record<string, string>;
  className?: string;
  /** 表情显示尺寸（px） */
  size?: number;
}

export function BiliEmoteText({
  text,
  emotes,
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
        return <Fragment key={`t-${index}`}>{part}</Fragment>;
      })}
    </span>
  );
}
