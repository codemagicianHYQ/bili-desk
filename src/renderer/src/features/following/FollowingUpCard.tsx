import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FollowingUp } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { FolderCog, List, Star, StarOff, UserMinus } from "lucide-react";
import { Link } from "react-router-dom";

interface FollowingUpCardProps {
  up: FollowingUp;
  showGroupActions?: boolean;
  isSpecial?: boolean;
  specialPending?: boolean;
  highlighted?: boolean;
  onSetGroup: (up: FollowingUp) => void;
  onToggleSpecial: (up: FollowingUp, special: boolean) => void;
  onUnfollow: (up: FollowingUp) => void;
}

/** 短名用大字，长名逐级缩小，尽量塞进一行 */
function nameSizeClass(name: string): string {
  const len = [...name].length;
  if (len <= 6) return "text-sm";
  if (len <= 10) return "text-[13px] leading-5";
  if (len <= 14) return "text-xs";
  if (len <= 18) return "text-[11px] leading-4";
  return "text-[10px] leading-4";
}

export function FollowingUpCard({
  up,
  showGroupActions = true,
  isSpecial = false,
  specialPending = false,
  highlighted = false,
  onSetGroup,
  onToggleSpecial,
  onUnfollow,
}: FollowingUpCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [nameTruncated, setNameTruncated] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const check = () => setNameTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [up.uname]);

  useLayoutEffect(() => {
    if (!menuOpen || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 176;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    );
    setMenuPos({ top: rect.bottom + 4, left });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const handleReposition = () => setMenuOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpen]);

  const nameTitle = [isSpecial ? "特别关注" : "", nameTruncated ? up.uname : ""]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (!highlighted) return;
    const el = document.getElementById(`following-up-${up.mid}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted, up.mid]);

  return (
    <div
      id={`following-up-${up.mid}`}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-shadow",
        highlighted && "ring-2 ring-primary/70 shadow-lg",
      )}
    >
      <Link to={`/up/${up.mid}`} className="shrink-0">
        <BiliImage
          src={up.face}
          alt=""
          className="h-12 w-12 rounded-full object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            ref={nameRef}
            to={`/up/${up.mid}`}
            title={nameTitle || undefined}
            className={cn(
              "min-w-0 truncate font-medium hover:text-primary",
              nameSizeClass(up.uname),
              isSpecial && "text-amber-400 hover:text-amber-300",
            )}
          >
            {up.uname}
          </Link>
          {up.mutual && (
            <Badge variant="secondary" className="shrink-0">
              互相关注
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {up.sign || "暂无签名"}
        </p>
      </div>

      <div className="relative shrink-0">
        <Button
          ref={buttonRef}
          type="button"
          size="sm"
          variant="secondary"
          className={cn(
            "gap-1 border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80",
            menuOpen && "bg-muted/80",
          )}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <List className="h-3.5 w-3.5" />
          已关注
        </Button>

        {menuOpen && menuPos && (
          <OverlayPortal>
            <div
              ref={menuRef}
              role="menu"
              data-glass-panel
              className={cn(
                "bili-glass fixed w-44 overflow-hidden rounded-lg border border-border bg-card shadow-lg",
                APP_OVERLAY_ZCLASS,
              )}
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {showGroupActions && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    onSetGroup(up);
                  }}
                >
                  <FolderCog className="h-4 w-4 text-muted-foreground" />
                  设置分组
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={specialPending}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleSpecial(up, !isSpecial);
                }}
              >
                {isSpecial ? (
                  <StarOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Star className="h-4 w-4 text-muted-foreground" />
                )}
                {isSpecial ? "移除特别关注" : "加入特别关注"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-secondary"
                onClick={() => {
                  setMenuOpen(false);
                  onUnfollow(up);
                }}
              >
                <UserMinus className="h-4 w-4" />
                取消关注
              </button>
            </div>
          </OverlayPortal>
        )}
      </div>
    </div>
  );
}
