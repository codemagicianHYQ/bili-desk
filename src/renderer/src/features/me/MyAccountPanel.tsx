import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  ExpRewardStatus,
  FansMedalItem,
  LiveSignInfo,
  MemberLogItem,
  VipCenterInfo,
  VipPrivilegeItem,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { Check, Crown, Loader2, Medal, Radio, Sparkles } from "lucide-react";

function Section({
  icon: Icon,
  title,
  extra,
  children,
}: {
  icon: typeof Crown;
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="flex-1 text-sm font-semibold">{title}</h3>
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

function TaskChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
        done
          ? "bg-emerald-500/15 text-emerald-500"
          : "bg-secondary text-muted-foreground",
      )}
    >
      {done && <Check className="h-3 w-3" />}
      {label}
    </span>
  );
}

function LogList({ items }: { items: MemberLogItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">暂无记录</p>;
  }
  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto text-xs">
      {items.map((item, index) => (
        <li
          key={`${item.time}-${index}`}
          className="flex items-center gap-3 py-1.5"
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
  const [vip, setVip] = useState<VipCenterInfo | null>(null);
  const [privileges, setPrivileges] = useState<VipPrivilegeItem[]>([]);
  const [reward, setReward] = useState<ExpRewardStatus | null>(null);
  const [liveSign, setLiveSign] = useState<LiveSignInfo | null>(null);
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
    void api
      .getLiveSignInfo()
      .then(setLiveSign)
      .catch(() => setLiveSign(null));
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

  const vipLabel = !vip?.active
    ? "未开通大会员"
    : vip.vipType === 2
      ? "年度大会员"
      : "大会员";

  return (
    <div className="space-y-4">
      {tip && (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground">
          {tip}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={Crown}
          title="大会员"
          extra={
            vip?.active ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
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
                领每日经验
              </Button>
            ) : null
          }
        >
          <p className="text-sm">
            <span className="font-medium text-[#fb7299]">{vipLabel}</span>
            {vip?.active && (
              <span className="ml-2 text-xs text-muted-foreground">
                到期 {formatDate(vip.dueDate)}
              </span>
            )}
          </p>
          {privileges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {privileges.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  disabled={item.received || busy === `pri-${item.type}`}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    item.received
                      ? "bg-secondary text-muted-foreground"
                      : "bg-primary/15 text-primary hover:bg-primary/25",
                  )}
                  onClick={() =>
                    void run(`pri-${item.type}`, async () => {
                      await window.biliDesk.bili.receiveVipPrivilege(item.type);
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
                  {item.received ? `${item.name} · 已领` : `领取${item.name}`}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Sparkles} title="今日经验任务">
          {reward ? (
            <div className="flex flex-wrap gap-2">
              <TaskChip done={reward.login} label="每日登录 +5" />
              <TaskChip done={reward.watch} label="观看视频 +5" />
              <TaskChip done={reward.share} label="分享视频 +5" />
              <TaskChip
                done={reward.coinExp >= 50}
                label={`投币 ${reward.coinExp}/50`}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">加载中…</p>
          )}
        </Section>

        <Section
          icon={Radio}
          title="直播签到"
          extra={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={liveSign?.signed || busy === "live-sign"}
              onClick={() =>
                void run("live-sign", async () => {
                  const message = await window.biliDesk.bili.doLiveSign();
                  setLiveSign((prev) => ({
                    signed: true,
                    text: message,
                    days: (prev?.days ?? 0) + 1,
                  }));
                  return message;
                })
              }
            >
              {busy === "live-sign" && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {liveSign?.signed ? "今日已签" : "签到"}
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground">
            {liveSign
              ? `${liveSign.text || "每日签到可得直播经验"} · 本月已签 ${liveSign.days} 天`
              : "签到信息获取失败，可直接点签到试试"}
          </p>
        </Section>

        <Section
          icon={Medal}
          title="硬币 / 经验记录"
          extra={
            <div className="flex gap-1 text-xs">
              {(["coin", "exp"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-0.5",
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
      </div>

      <Section icon={Medal} title={`粉丝勋章（${medals.length}）`}>
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
