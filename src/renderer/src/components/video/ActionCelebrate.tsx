import { useEffect } from "react";
import { cn } from "@/lib/utils";

export type CelebrateKind = "like" | "coin" | "triple";

interface ActionCelebrateProps {
  kind: CelebrateKind;
  open: boolean;
  onDone: () => void;
}

/** 点赞 / 投币成功时的小电视弹出动画（参考官方互动反馈，非官方素材复刻） */
export function ActionCelebrate({ kind, open, onDone }: ActionCelebrateProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [open, onDone]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 -translate-x-1/2"
      aria-hidden
    >
      <div
        className={cn(
          "relative flex h-24 w-28 items-end justify-center",
          "animate-[bili-celebrate-pop_1.35s_cubic-bezier(0.22,1.2,0.36,1)_both]",
        )}
      >
        <span className="absolute left-2 top-2 h-2 w-2 animate-[bili-star-twinkle_1s_ease-in-out_infinite] text-amber-300">
          ★
        </span>
        <span className="absolute right-3 top-1 h-2.5 w-2.5 animate-[bili-star-twinkle_1.1s_ease-in-out_0.15s_infinite] text-yellow-300">
          ★
        </span>
        <span className="absolute left-8 top-0 animate-[bili-star-twinkle_0.9s_ease-in-out_0.3s_infinite] text-[10px] text-amber-200">
          ★
        </span>
        <span className="absolute right-6 top-5 animate-[bili-star-twinkle_1.2s_ease-in-out_0.45s_infinite] text-xs text-yellow-200">
          ★
        </span>
        {kind === "triple" && (
          <>
            <span className="absolute -left-1 top-6 animate-[bili-star-twinkle_0.8s_ease-in-out_0.1s_infinite] text-sm text-pink-300">
              ♥
            </span>
            <span className="absolute -right-2 top-8 animate-[bili-star-twinkle_0.85s_ease-in-out_0.25s_infinite] text-xs text-sky-300">
              ★
            </span>
            <span className="absolute left-10 -top-1 text-[10px] font-black tracking-widest text-white drop-shadow animate-[bili-celebrate-pop_1.35s_cubic-bezier(0.22,1.2,0.36,1)_both]">
              三连!
            </span>
          </>
        )}

        <TvMascot kind={kind} />
      </div>
    </div>
  );
}

function TvMascot({ kind }: { kind: CelebrateKind }) {
  return (
    <svg
      viewBox="0 0 120 110"
      className="h-[88px] w-[100px] drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M38 18 L50 34"
        stroke="hsl(var(--primary))"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M82 18 L70 34"
        stroke="hsl(var(--primary))"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="36" cy="14" r="5" fill="hsl(var(--primary))" />
      <circle cx="84" cy="14" r="5" fill="hsl(var(--primary))" />

      <rect
        x="22"
        y="34"
        width="76"
        height="58"
        rx="16"
        fill="url(#tvBody)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2"
      />
      <rect x="32" y="44" width="56" height="30" rx="8" fill="#fff7fb" />

      {kind === "like" ? (
        <>
          <path
            d="M44 56 Q50 50 56 56"
            stroke="#5b4a55"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M64 56 Q70 50 76 56"
            stroke="#5b4a55"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M52 66 Q60 72 68 66"
            stroke="#5b4a55"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <circle cx="50" cy="56" r="3.2" fill="#5b4a55" />
          <circle cx="70" cy="56" r="3.2" fill="#5b4a55" />
          <path
            d="M50 66 Q60 74 70 66"
            stroke="#5b4a55"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      <path
        d="M34 78 H86"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {kind === "like" ? (
        <g transform="translate(78,58)">
          <circle cx="14" cy="14" r="16" fill="#fff" opacity="0.95" />
          <path
            d="M10 16 v-5.5 a2.4 2.4 0 0 1 4.8 0 V16 M14.8 16 v-3.8 a2 2 0 0 1 4 0 V16 M18.8 16 v-2.6 a1.8 1.8 0 0 1 3.6 0 V18.5 c0 3.2-2.2 5.5-5.4 5.5 h-4.2 c-2.4 0-4-1.4-4.6-3.4 L7.5 17.2 a1.6 1.6 0 0 1 2.9-1.2z"
            fill="hsl(var(--primary))"
          />
        </g>
      ) : kind === "coin" ? (
        <g transform="translate(78,58)">
          <circle cx="14" cy="14" r="16" fill="#FFE8A3" />
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="#FFC94A"
            stroke="#E8A317"
            strokeWidth="2"
          />
          <text
            x="14"
            y="18"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#8A5A00"
          >
            币
          </text>
        </g>
      ) : (
        <g>
          <g transform="translate(4,72)">
            <circle cx="12" cy="12" r="13" fill="#fff" />
            <path
              d="M8 13 v-4 a2 2 0 0 1 4 0 V13 M12 13 v-3 a1.7 1.7 0 0 1 3.4 0 V13 M15.4 13 v-2 a1.5 1.5 0 0 1 3 0 V15 c0 2.6-1.8 4.5-4.4 4.5 h-3.4 c-2 0-3.3-1.1-3.8-2.8 L6.2 14 a1.3 1.3 0 0 1 2.4-1z"
              fill="hsl(var(--primary))"
            />
          </g>
          <g transform="translate(46,70)">
            <circle cx="12" cy="12" r="13" fill="#FFE8A3" />
            <circle cx="12" cy="12" r="9" fill="#FFC94A" stroke="#E8A317" strokeWidth="1.6" />
            <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="#8A5A00">
              币
            </text>
          </g>
          <g transform="translate(88,72)">
            <circle cx="12" cy="12" r="13" fill="#fff" />
            <path
              d="M12 6.2 L14.2 10.6 L19.2 11.2 L15.6 14.6 L16.6 19.5 L12 17.2 L7.4 19.5 L8.4 14.6 L4.8 11.2 L9.8 10.6 Z"
              fill="#F0B429"
            />
          </g>
        </g>
      )}

      <defs>
        <linearGradient id="tvBody" x1="22" y1="34" x2="98" y2="92">
          <stop stopColor="hsl(var(--primary))" stopOpacity="0.95" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.72" />
        </linearGradient>
      </defs>
    </svg>
  );
}
