import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  ExpRewardStatus,
  FansMedalItem,
  MemberLogItem,
  VipCenterInfo,
  VipPrivilegeItem,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import {
  Check,
  Coins,
  Crown,
  Gift,
  History,
  Loader2,
  LogIn,
  Medal,
  PlayCircle,
  Share2,
  Sparkles,
} from "lucide-react";

const DAILY_EXP_LIMIT = 65;
const COIN_EXP_LIMIT = 50;

function Section({
  icon: Icon,
  title,
  description,
  extra,
  className,
  children,
}: {
  icon: typeof Crown;
  title: string;
  description?: string;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TaskRow({
  icon: Icon,
  label,
  hint,
  done,
  progress,
}: {
  icon: typeof Crown;
  label: string;
  hint: string;
  done: boolean;
  progress?: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          done ? "text-emerald-500" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      {done ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
          <Check className="h-3.5 w-3.5" />
          已完成
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          {progress ?? "未完成"}
        </span>
      )}
    </li>
  );
}

function LogList({ items }: { items: MemberLogItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">近期没有变动</p>;
  }
  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto text-xs">
      {items.map((item, index) => (
        <li
          key={`${item.time}-${index}`}
          className="flex items-center gap-3 py-2"
        >
          <span className="w-36 shrink-0 text-muted-foreground">
            {item.time}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.reason}</span>
          <span
            className={cn(
              "shrink-0 font-mono",
              item.delta >= 0 ? "text-emerald-500" : "text-red-400",
            )}
          >
            {item.delta > 0 ? `+${item.delta}` : item.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MyAccountPanel() {
  const [vip, setVip] = useState<VipCenterInfo | null | undefined>();
  const [privileges, setPrivileges] = useState<VipPrivilegeItem[]>([]);
  const [reward, setReward] = useState<ExpRewardStatus | null | undefined>();
  const [medals, setMedals] = useState<FansMedalItem[]>([]);
  const [medalPage, setMedalPage] = useState(1);
  const [medalHasMore, setMedalHasMore] = useState(false);
  const [logTab, setLogTab] = useState<"coin" | "exp">("coin");
  const [logs, setLogs] = useState<MemberLogItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [tip, setTip] = useState("");

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(
      () => setTip((prev) => (prev === message ? "" : prev)),
      2600,
    );
  };

  const run = async (key: string, task: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(key);
    try {
      const message = await task();
      if (message) showTip(message);
    } catch (err) {
      showTip(extractIpcErrorMessage(err) || "操作失败");
    } finally {
      setBusy("");
    }
  };

  const loadMedals = useCallback(async (page: number) => {
    const result = await window.biliDesk.bili.getFansMedals(page);
    setMedals((prev) => (page === 1 ? result.list : [...prev, ...result.list]));
    setMedalPage(result.page);
    setMedalHasMore(result.hasMore);
  }, []);

  useEffect(() => {
    const api = window.biliDesk.bili;
    void api
      .getVipCenter()
      .then(setVip)
      .catch(() => setVip(null));
    void api
      .getVipPrivileges()
      .then(setPrivileges)
      .catch(() => setPrivileges([]));
    void api
      .getExpReward()
      .then(setReward)
      .catch(() => setReward(null));
    void loadMedals(1).catch(() => setMedals([]));
  }, [loadMedals]);

  useEffect(() => {
    setLogs(null);
    const task =
      logTab === "coin"
        ? window.biliDesk.bili.getCoinLog()
        : window.biliDesk.bili.getExpLog();
    void task.then(setLogs).catch(() => setLogs([]));
  }, [logTab]);

  const vipActive = Boolean(vip?.active);
  const todayExp = reward
    ? (reward.login ? 5 : 0) +
      (reward.watch ? 5 : 0) +
      (reward.share ? 5 : 0) +
      Math.min(reward.coinExp, COIN_EXP_LIMIT)
    : 0;

  return (
    <div className="space-y-4">
      {tip && (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground">
          {tip}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={Sparkles}
          title="今日经验"
          description="每天最多 65 经验，用来提升账号等级"
        >
          {reward ? (
            <>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="text-2xl font-semibold text-primary">
                    {todayExp}
                  </span>
                  <span className="ml-1 text-muted-foreground">
                    / {DAILY_EXP_LIMIT}
                  </span>
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.min(100, (todayExp / DAILY_EXP_LIMIT) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <ul className="space-y-2">
                <TaskRow
                  icon={LogIn}
                  label="每日登录"
                  hint="+5 经验"
                  done={reward.login}
                />
                <TaskRow
                  icon={PlayCircle}
                  label="观看一个视频"
                  hint="+5 经验"
                  done={reward.watch}
                />
                <TaskRow
                  icon={Share2}
                  label="分享一个视频"
                  hint="+5 经验"
                  done={reward.share}
                />
                <TaskRow
                  icon={Coins}
                  label="给视频投币"
                  hint="每枚 +10 经验，最多 50"
                  done={reward.coinExp >= COIN_EXP_LIMIT}
                  progress={`${reward.coinExp} / ${COIN_EXP_LIMIT}`}
                />
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {reward === null ? "经验任务获取失败，稍后再试" : "加载中…"}
            </p>
          )}
        </Section>

        <Section
          icon={Crown}
          title="大会员福利"
          description={
            vip === undefined
              ? "加载中…"
              : vipActive
                ? `${vip?.vipType === 2 ? "年度大会员" : "大会员"} · ${formatDate(vip?.dueDate ?? 0)} 到期`
                : "未开通大会员"
          }
        >
          {vipActive ? (
            <>
              <div className="flex items-center gap-3 rounded-lg bg-[#fb7299]/10 px-3 py-2.5">
                <Sparkles className="h-4 w-4 shrink-0 text-[#fb7299]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">每日大会员经验</p>
                  <p className="text-[11px] text-muted-foreground">
                    每天可额外领取 +10 经验
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === "vip-exp"}
                  onClick={() =>
                    void run("vip-exp", () =>
                      window.biliDesk.bili.claimVipExperience(),
                    )
                  }
                >
                  {busy === "vip-exp" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  领取
                </Button>
              </div>
              {privileges.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    每月福利券（每月 1 日刷新）
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {privileges.map((item) => (
                      <li
                        key={item.type}
                        className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2"
                      >
                        <Gift className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {item.name}
                        </span>
                        {item.received ? (
                          <span className="text-xs text-muted-foreground">
                            已领
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={busy === `pri-${item.type}`}
                            onClick={() =>
                              void run(`pri-${item.type}`, async () => {
                                await window.biliDesk.bili.receiveVipPrivilege(
                                  item.type,
                                );
                                setPrivileges((prev) =>
                                  prev.map((entry) =>
                                    entry.type === item.type
                                      ? { ...entry, received: true }
                                      : entry,
                                  ),
                                );
                                return `已领取${item.name}`;
                              })
                            }
                          >
                            领取
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            vip !== undefined && (
              <p className="rounded-lg bg-secondary/40 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                开通大会员后，这里可以一键领取每日 +10 经验，以及每月的 B
                币券、会员购优惠券、装扮体验卡等福利。
              </p>
            )
          )}
        </Section>
      </div>

      <Section
        icon={History}
        title="硬币 / 经验记录"
        description="近期每一笔硬币和经验的变动"
        extra={
          <div className="flex gap-1 rounded-full bg-secondary/50 p-0.5 text-xs">
            {(["coin", "exp"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1",
                  logTab === key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setLogTab(key)}
              >
                {key === "coin" ? "硬币" : "经验"}
              </button>
            ))}
          </div>
        }
      >
        {logs ? (
          <LogList items={logs} />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </Section>

      <Section
        icon={Medal}
        title={`粉丝勋章（${medals.length}）`}
        description="佩戴后会显示在直播间弹幕和评论区昵称旁"
      >
        {medals.length === 0 ? (
          <p className="text-xs text-muted-foreground">还没有粉丝勋章</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {medals.map((medal) => (
              <div
                key={medal.medalId}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2",
                  medal.wearing ? "border-primary/60" : "border-border",
                )}
              >
                <Link to={`/up/${medal.upMid}`} className="shrink-0">
                  <BiliImage
                    src={medal.upFace}
                    alt={medal.upName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm">
                    <span className="rounded bg-[#fb7299]/15 px-1.5 text-xs text-[#fb7299]">
                      {medal.name} {medal.level}
                    </span>
                    <span className="truncate">{medal.upName}</span>
                    {medal.living && (
                      <Link
                        to={`/live/${medal.roomId}`}
                        className="shrink-0 text-[10px] text-primary"
                      >
                        直播中
                      </Link>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    亲密度 {medal.intimacy}/{medal.nextIntimacy || "—"} · 今日{" "}
                    {medal.todayFeed}/{medal.dayLimit || "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={medal.wearing ? "secondary" : "outline"}
                  disabled={busy === `medal-${medal.medalId}`}
                  onClick={() =>
                    void run(`medal-${medal.medalId}`, async () => {
                      await window.biliDesk.bili.wearFansMedal(
                        medal.wearing ? null : medal.medalId,
                      );
                      setMedals((prev) =>
                        prev.map((entry) => ({
                          ...entry,
                          wearing: medal.wearing
                            ? false
                            : entry.medalId === medal.medalId,
                        })),
                      );
                      return medal.wearing
                        ? "已摘下勋章"
                        : `已佩戴「${medal.name}」`;
                    })
                  }
                >
                  {medal.wearing ? "摘下" : "佩戴"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {medalHasMore && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              void loadMedals(medalPage + 1).catch(() => undefined)
            }
          >
            加载更多勋章
          </Button>
        )}
      </Section>
    </div>
  );
}
