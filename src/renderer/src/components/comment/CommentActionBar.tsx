import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import {
  Copy,
  Flag,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";

export const COMMENT_REPORT_REASONS: Array<{ id: number; label: string }> = [
  { id: 1, label: "违法违规" },
  { id: 2, label: "色情低俗" },
  { id: 4, label: "赌博诈骗" },
  { id: 6, label: "人身攻击" },
  { id: 7, label: "引战" },
  { id: 8, label: "剧透" },
  { id: 9, label: "恶意刷屏" },
  { id: 0, label: "其他" },
];

interface CommentActionBarProps {
  leading?: ReactNode;
  liked: boolean;
  hated: boolean;
  likeCount: number;
  liking?: boolean;
  hating?: boolean;
  deleting?: boolean;
  reporting?: boolean;
  isOwn: boolean;
  canDelete: boolean;
  copyText?: string;
  onLike: () => void;
  onHate: () => void;
  onReply: () => void;
  onDelete: () => void;
  onReport: (reason: number) => void;
}

export function CommentActionBar({
  leading,
  liked,
  hated,
  likeCount,
  liking,
  hating,
  deleting,
  reporting,
  isOwn,
  canDelete,
  copyText,
  onLike,
  onHate,
  onReply,
  onDelete,
  onReport,
}: CommentActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [copyTip, setCopyTip] = useState("");

  const handleCopy = async () => {
    const text = copyText?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyTip("已复制");
    } catch {
      setCopyTip("复制失败");
    }
    window.setTimeout(() => setCopyTip(""), 1600);
  };

  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {leading}
        <button
          type="button"
          disabled={liking}
          onClick={onLike}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-primary",
            liked && "text-primary",
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
          {likeCount > 0 ? formatCount(likeCount) : "点赞"}
        </button>
        <button
          type="button"
          disabled={hating}
          onClick={onHate}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-primary",
            hated && "text-primary",
          )}
        >
          <ThumbsDown className={cn("h-3.5 w-3.5", hated && "fill-current")} />
          点踩
        </button>
        <button
          type="button"
          onClick={onReply}
          className="inline-flex items-center gap-1 transition-colors hover:text-primary"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          回复
        </button>
        {copyText?.trim() && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyTip || "复制评论"}
          </button>
        )}
        {canDelete &&
          (confirmDelete ? (
            <>
              <button
                type="button"
                disabled={deleting}
                onClick={onDelete}
                className="text-red-400 transition-colors hover:text-red-300"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="transition-colors hover:text-foreground"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 transition-colors hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          ))}
        {!isOwn && (
          <button
            type="button"
            onClick={() => setShowReport((open) => !open)}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            <Flag className="h-3.5 w-3.5" />
            举报
          </button>
        )}
      </div>

      {showReport && !isOwn && (
        <div className="flex flex-wrap gap-1.5">
          {COMMENT_REPORT_REASONS.map((reason) => (
            <Button
              key={reason.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={reporting}
              className="h-7 px-2 text-xs"
              onClick={() => {
                onReport(reason.id);
                setShowReport(false);
              }}
            >
              {reason.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
