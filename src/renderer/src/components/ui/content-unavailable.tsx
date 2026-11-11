import type { ReactNode } from "react";
import { FileX2, ShieldAlert } from "lucide-react";
import type { BiliFailureHint } from "@shared/bili-error";
import { describeBiliFailure } from "@shared/bili-error";

export function ErrorState({
  error,
  hint,
  fallback,
  action,
  className = "h-full",
}: {
  error: unknown;
  hint?: BiliFailureHint;
  fallback?: string;
  action?: ReactNode;
  className?: string;
}) {
  const copy = describeBiliFailure(error, hint, fallback);
  const blocked = /安全策略|风控|频繁|登录/.test(copy.title);
  const Icon = blocked ? ShieldAlert : FileX2;

  return (
    <div className={`flex items-center justify-center px-6 py-16 ${className}`}>
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card/70 px-8 py-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
          <Icon className="h-7 w-7" strokeWidth={1.6} />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {copy.title}
        </h2>
        {copy.detail && copy.detail !== copy.title ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {copy.detail}
          </p>
        ) : null}
        {action ? (
          <div className="mt-5 flex justify-center">{action}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ContentUnavailable({
  kind,
  error,
}: {
  kind: "video" | "dynamic";
  error: unknown;
}) {
  return (
    <ErrorState
      error={error}
      hint={kind}
      fallback={
        kind === "video"
          ? "视频信息获取失败，请稍后重试。"
          : "动态加载失败，请稍后重试。"
      }
    />
  );
}
