import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { MyCollectionsPanel } from "@/features/me/MyCollectionsPanel";

export function CollectionsPage() {
  const user = useAppStore((s) => s.user);
  const mid = user?.mid ?? 0;
  const loggedIn = Boolean(user?.isLogin && mid > 0);

  if (!loggedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/40">
          <Layers className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">合集</h2>
          <p className="text-sm text-muted-foreground">
            登录后可查看已订阅与自建合集
          </p>
        </div>
        <Button asChild>
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">合集</h2>
            <p className="text-xs text-muted-foreground">
              订阅的视频合集与自己创建的合集 / 系列
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4 lg:p-5">
        <MyCollectionsPanel mid={mid} layout="page" />
      </div>
    </div>
  );
}
