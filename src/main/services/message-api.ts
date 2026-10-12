import { randomUUID } from "crypto";
import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type {
  ChatEmote,
  ChatMessage,
  ChatPage,
  MessageFeedItem,
  MessageFeedKind,
  MessageFeedPage,
  MessageFeedUser,
  MessageSession,
  MessageSessionFilter,
  MessageSessionPage,
  MessageSettings,
  MessageUnread,
  SystemNotice,
  SystemNoticePage,
} from "@shared/types";
import { appStore, getCookieString, isLoggedIn } from "../store/app-store";
import { defaultHeaders, getCsrf, signParams } from "./wbi";

const WEB = { build: 0, mobi_app: "web" } as const;

const SESSION_QUERY: Record<
  MessageSessionFilter,
  Record<string, string | number>
> = {
  all: { session_type: 4, group_fold: 0, unfollow_fold: 0 },
  followed: { session_type: 9, group_fold: 1, unfollow_fold: 1 },
  unfollowed: { session_type: 2, group_fold: 1, unfollow_fold: 0 },
  group: { session_type: 3, group_fold: 0, unfollow_fold: 1 },
  intercepted: { session_type: 5, group_fold: 1, unfollow_fold: 1 },
};

const SYSTEM_NAMES: Record<number, string> = {
  1: "主播小助手",
  5: "系统通知",
  7: "UP主小助手",
  8: "客服消息",
  9: "支付小助手",
};

const FEED_PATH: Record<MessageFeedKind, string> = {
  reply: "/x/msgfeed/reply",
  at: "/x/msgfeed/at",
  like: "/x/msgfeed/like",
};

const FEED_TP: Record<MessageFeedKind, string> = {
  reply: "0",
  at: "1",
  like: "2",
};

function applyHeaders(
  cfg: InternalAxiosRequestConfig,
  extra?: Record<string, string>,
): InternalAxiosRequestConfig {
  const headers = AxiosHeaders.from(defaultHeaders());
  if (extra) headers.set(extra);
  headers.set(cfg.headers);
  headers.set("Cookie", getCookieString());
  cfg.headers = headers;
  return cfg;
}

function parseJsonKeepBigint(data: unknown): unknown {
  if (typeof data !== "string" || !data) return data;
  const safe = data.replace(/([:[\],]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
  try {
    return JSON.parse(safe);
  } catch {
    return data;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function idOf(value: unknown): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function httpsUrl(value: unknown): string {
  return textOf(value).replace(/^http:\/\//i, "https://");
}

function apiError(data: unknown, fallback: string): string {
  const record = asRecord(data);
  const message = textOf(record?.message) || textOf(record?.msg);
  if (!message || message === "0" || message === "OK") return fallback;
  return message;
}

function assertOk(data: unknown, fallback: string): Record<string, unknown> {
  const record = asRecord(data);
  const code = numOf(record?.code);
  if (!record || code !== 0) {
    throw new Error(apiError(data, fallback));
  }
  return asRecord(record.data) ?? {};
}

function requireCsrf(): string {
  if (!isLoggedIn()) throw new Error("请先登录后再查看消息");
  const csrf = getCsrf();
  if (!csrf) throw new Error("请先登录后再查看消息");
  return csrf;
}

function selfMid(): number {
  const mid = Number(appStore.get("cookies").DedeUserID);
  return Number.isFinite(mid) ? mid : 0;
}

function parseContent(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (record) return record;
    if (Array.isArray(parsed)) return { content: parsed };
    return {};
  } catch {
    return { content: raw };
  }
}

/** 系统提示的正文是 `[{text,color_day,color_nig}]`，不是普通字符串 */
function notifySegments(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: string[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row || typeof row.text !== "string") return null;
    parts.push(row.text);
  }
  return parts.join("");
}

function messageBody(content: Record<string, unknown>): string {
  for (const field of [
    content.content,
    content.text,
    content.desc,
    content.summary,
  ]) {
    if (Array.isArray(field)) {
      const plain = notifySegments(field);
      if (plain !== null) return plain;
    }
    const text = textOf(field);
    if (!text) continue;
    if (text.trim().startsWith("[")) {
      try {
        const plain = notifySegments(JSON.parse(text) as unknown);
        if (plain !== null) return plain;
      } catch {
        // 普通文本里碰巧以 [ 开头
      }
    }
    return text;
  }
  return "";
}

function jumpOf(content: Record<string, unknown>): string {
  const config = asRecord(content.jump_uri_config);
  return (
    httpsUrl(content.jump_uri) ||
    httpsUrl(content.url) ||
    httpsUrl(content.uri) ||
    httpsUrl(config?.all_uri)
  );
}

function cardDate(value: unknown): string {
  if (
    typeof value === "string" &&
    value.trim() &&
    !/^\d+$/.test(value.trim())
  ) {
    return value.trim();
  }
  const stamp = numOf(value);
  if (!stamp) return "";
  const date = new Date(stamp > 1e12 ? stamp : stamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function shareJump(msgType: number, content: Record<string, unknown>): string {
  const direct = jumpOf(content);
  if (direct) return direct;
  const bvid = textOf(content.bvid);
  if (/^BV/i.test(bvid)) return `https://www.bilibili.com/video/${bvid}`;
  const rid = numOf(content.rid ?? content.id);
  if (!rid) return "";
  if (msgType === 11) return `https://www.bilibili.com/video/av${rid}`;
  if (msgType === 13) return `https://www.bilibili.com/opus/${rid}`;
  if (msgType === 12 || msgType === 14) {
    return `https://www.bilibili.com/read/cv${rid}`;
  }
  return "";
}

function imageTypeOf(name: string, mime: string): string {
  const lower = `${name} ${mime}`.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("webp")) return "webp";
  return "jpeg";
}

function previewOf(msg: Record<string, unknown> | null): string {
  if (!msg) return "";
  if (numOf(msg.msg_status) === 1 || numOf(msg.msg_type) === 5) {
    return "撤回了一条消息";
  }
  const content = parseContent(msg.content);
  const title = textOf(content.title) || textOf(content.headline);
  const body = messageBody(content);
  switch (numOf(msg.msg_type)) {
    case 1:
    case 18:
      return body || "[消息]";
    case 2:
      return "[图片]";
    case 6:
      return body || "[表情]";
    default:
      return title || body || "[消息]";
  }
}

function toChatMessage(
  raw: Record<string, unknown>,
  mineId: number,
): ChatMessage | null {
  if (raw.sys_cancel === true) return null;
  const content = parseContent(raw.content);
  const status = numOf(raw.msg_status);
  const msgType = numOf(raw.msg_type);
  const recalled = status === 1 || msgType === 5;
  return {
    seqno: idOf(raw.msg_seqno),
    msgKey: idOf(raw.msg_key),
    senderUid: numOf(raw.sender_uid),
    msgType,
    status,
    time: numOf(raw.timestamp),
    text: recalled ? "撤回了一条消息" : messageBody(content),
    imageUrl: recalled ? "" : httpsUrl(content.url) || httpsUrl(content.thumb),
    title: recalled ? "" : textOf(content.title) || textOf(content.headline),
    jumpUrl: recalled ? "" : shareJump(msgType, content),
    cover: recalled
      ? ""
      : httpsUrl(content.cover) ||
        httpsUrl(asArray(content.image_urls)[0]) ||
        httpsUrl(content.image) ||
        httpsUrl(content.thumb),
    source: numOf(raw.msg_source),
    mine: numOf(raw.sender_uid) === mineId,
    views: numOf(content.view ?? content.view_count),
    pubDate: cardDate(content.pub_date ?? content.pubdate ?? content.ctime),
  };
}

function feedUser(raw: unknown): MessageFeedUser | null {
  const user = asRecord(raw);
  if (!user) return null;
  const mid = numOf(user.mid ?? user.uid);
  const name = textOf(user.nickname ?? user.uname ?? user.name);
  if (!mid && !name) return null;
  return {
    mid,
    name: name || "用户",
    face: httpsUrl(user.avatar ?? user.face),
  };
}

function toFeedItem(raw: unknown): MessageFeedItem | null {
  const item = asRecord(raw);
  if (!item) return null;
  const body = asRecord(item.item) ?? {};
  const users = [
    ...asArray(item.users).map(feedUser),
    feedUser(item.user),
  ].filter((user): user is MessageFeedUser => Boolean(user));
  const unique = new Map<string, MessageFeedUser>();
  for (const user of users) unique.set(`${user.mid}:${user.name}`, user);
  const native = textOf(body.native_uri);
  const rootFromUri = numOf(native.match(/comment_root_id=(\d+)/)?.[1]);
  const rpidFromUri = numOf(native.match(/comment_secondary_id=(\d+)/)?.[1]);
  const subjectId = numOf(body.subject_id ?? body.item_id);
  const itemId = numOf(body.item_id);
  return {
    id: idOf(item.id),
    time: numOf(item.reply_time ?? item.at_time ?? item.like_time),
    users: [...unique.values()],
    counts: Math.max(1, numOf(item.counts)),
    business: textOf(body.business),
    title: textOf(body.title) || textOf(body.desc),
    content:
      textOf(body.source_content) || textOf(body.message) || textOf(body.desc),
    quote: textOf(body.target_reply_content) || textOf(body.root_reply_content),
    cover: httpsUrl(body.image),
    uri: httpsUrl(body.uri) || native,
    subjectId,
    businessId: numOf(body.business_id ?? body.like_business_id),
    rootId: numOf(body.root_id) || rootFromUri,
    sourceId:
      numOf(body.source_id) ||
      rpidFromUri ||
      numOf(body.target_id) ||
      (itemId > 0 && itemId !== subjectId ? itemId : 0),
  };
}

function toMyReplyFromNotice(raw: unknown): MessageFeedItem | null {
  const item = asRecord(raw);
  if (!item) return null;
  const body = asRecord(item.item) ?? {};
  const targetText = textOf(body.target_reply_content);
  const rootText = textOf(body.root_reply_content);
  const mineText = targetText || rootText;
  const rootId = numOf(body.root_id);
  const targetId = numOf(body.target_id);
  const rpid = targetText && targetId > 0 ? targetId : rootId;
  if (!mineText || !rpid) return null;
  const replyText = textOf(body.source_content);
  const native = textOf(body.native_uri);
  return {
    id: String(rpid),
    time: numOf(item.reply_time),
    users: [{ mid: selfMid(), name: "我", face: "" }],
    counts: 1,
    business: textOf(body.business) || "评论",
    title: textOf(body.title) || textOf(body.desc),
    content: mineText,
    quote: replyText && replyText !== mineText ? replyText : "",
    cover: httpsUrl(body.image),
    uri: httpsUrl(body.uri) || native,
    subjectId: numOf(body.subject_id),
    businessId: numOf(body.business_id) || 1,
    rootId: rootId || rpid,
    sourceId: rpid,
  };
}

function noticeArray(data: Record<string, unknown>): unknown[] {
  for (const key of [
    "notifies",
    "items",
    "list",
    "system_notify_list",
    "notify_list",
  ]) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

function toNotice(raw: unknown): SystemNotice | null {
  const item = asRecord(raw);
  if (!item) return null;
  const source = asRecord(item.source);
  const title = textOf(item.title) || textOf(item.card_brief);
  const content =
    textOf(item.content) || textOf(item.text) || textOf(item.card_msg);
  if (!title && !content) return null;
  return {
    id: idOf(item.id) || idOf(item.notify_id),
    cursor: idOf(item.cursor) || idOf(item.id),
    title: title || "系统通知",
    content,
    timeText: textOf(item.time_at) || textOf(item.time),
    time: numOf(item.ctime ?? item.publish_time),
    cover: httpsUrl(item.image ?? item.cover ?? source?.logo),
    uri: httpsUrl(item.url ?? item.uri ?? item.jump_url),
    sourceName: textOf(source?.name) || textOf(item.source_name),
  };
}

function wordsFrom(data: unknown): string[] {
  const record = asRecord(data);
  const list = Array.isArray(data)
    ? data
    : asArray(
        record?.words ?? record?.list ?? record?.items ?? record?.block_words,
      );
  const words = list
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const row = asRecord(item);
      return textOf(row?.content ?? row?.word ?? row?.name).trim();
    })
    .filter(Boolean);
  return [...new Set(words)];
}

class MessageApiService {
  private client: AxiosInstance;
  private vcClient: AxiosInstance;
  private messageClient: AxiosInstance;
  private devId = randomUUID().toUpperCase();

  constructor() {
    const messageHeaders = {
      Referer: "https://message.bilibili.com/",
      Origin: "https://message.bilibili.com",
    };
    this.client = axios.create({
      baseURL: "https://api.bilibili.com",
      timeout: 15000,
      transformResponse: [parseJsonKeepBigint],
    });
    this.vcClient = axios.create({
      baseURL: "https://api.vc.bilibili.com",
      timeout: 15000,
      transformResponse: [parseJsonKeepBigint],
    });
    this.messageClient = axios.create({
      baseURL: "https://message.bilibili.com",
      timeout: 15000,
      transformResponse: [parseJsonKeepBigint],
    });
    for (const client of [this.client, this.vcClient, this.messageClient]) {
      client.interceptors.request.use(async (cfg) =>
        applyHeaders(cfg, messageHeaders),
      );
    }
  }

  private async postForm(
    client: AxiosInstance,
    path: string,
    fields: Record<string, string>,
    fallback: string,
  ): Promise<Record<string, unknown>> {
    const csrf = requireCsrf();
    const res = await client.post(
      path,
      new URLSearchParams({
        ...fields,
        csrf,
        csrf_token: csrf,
        build: "0",
        mobi_app: "web",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );
    return assertOk(res.data, fallback);
  }

  async getUnread(): Promise<MessageUnread> {
    requireCsrf();
    const empty: MessageUnread = {
      reply: 0,
      at: 0,
      like: 0,
      sys: 0,
      chat: 0,
      group: 0,
      dustbin: 0,
    };
    const [feed, single, group] = await Promise.allSettled([
      this.client.get("/x/msgfeed/unread", {
        params: WEB,
        validateStatus: () => true,
      }),
      this.vcClient.get("/session_svr/v1/session_svr/single_unread", {
        params: {
          unread_type: 0,
          show_unfollow_list: 1,
          show_dustbin: 1,
          ...WEB,
        },
        validateStatus: () => true,
      }),
      this.vcClient.get("/session_svr/v1/session_svr/my_group_unread", {
        params: WEB,
        validateStatus: () => true,
      }),
    ]);

    if (feed.status === "fulfilled") {
      try {
        const data = assertOk(feed.value.data, "未读数获取失败");
        empty.reply = numOf(data.reply);
        empty.at = numOf(data.at);
        empty.like = numOf(data.like);
        empty.sys = numOf(data.sys_msg);
      } catch {
        // 通知未读失败时仍返回私信未读
      }
    }
    if (
      single.status === "fulfilled" &&
      numOf(asRecord(single.value.data)?.code) === 0
    ) {
      const data = asRecord(asRecord(single.value.data)?.data) ?? {};
      empty.chat = numOf(data.follow_unread) + numOf(data.unfollow_unread);
      empty.dustbin = numOf(data.dustbin_unread);
    }
    if (
      group.status === "fulfilled" &&
      numOf(asRecord(group.value.data)?.code) === 0
    ) {
      const data = asRecord(group.value.data)?.data;
      const record = asRecord(data);
      empty.group = record
        ? numOf(record.unread_count ?? record.unread)
        : numOf(data);
    }
    return empty;
  }

  async getSessions(
    filter: MessageSessionFilter = "all",
    endTs = 0,
  ): Promise<MessageSessionPage> {
    requireCsrf();
    const res = await this.vcClient.get(
      "/session_svr/v1/session_svr/get_sessions",
      {
        params: {
          ...SESSION_QUERY[filter],
          sort_rule: 2,
          size: 20,
          ...WEB,
          ...(endTs > 0 ? { end_ts: endTs } : {}),
        },
        validateStatus: () => true,
      },
    );
    const data = assertOk(res.data, "会话列表获取失败");
    const rows = asArray(data.session_list)
      .map((item) => this.toSession(asRecord(item)))
      .filter((item): item is MessageSession => Boolean(item));
    await this.fillSessionProfiles(rows);
    const lastTs = rows.length > 0 ? rows[rows.length - 1].sessionTs : 0;
    const moreFlag = data.has_more;
    const hasMore =
      (moreFlag == null ? rows.length >= 20 : numOf(moreFlag) === 1) &&
      lastTs > 0 &&
      lastTs !== endTs;
    return {
      items: rows,
      hasMore,
      endTs: lastTs,
    };
  }

  private toSession(
    raw: Record<string, unknown> | null,
  ): MessageSession | null {
    if (!raw) return null;
    const talkerId = idOf(raw.talker_id);
    if (!talkerId) return null;
    const account = asRecord(raw.account_info);
    const systemType = numOf(raw.system_msg_type);
    const sessionType = numOf(raw.session_type) || 1;
    const last = asRecord(raw.last_msg);
    return {
      talkerId,
      sessionType,
      name:
        textOf(account?.name) ||
        textOf(raw.group_name) ||
        SYSTEM_NAMES[systemType] ||
        "",
      face: httpsUrl(account?.pic_url) || httpsUrl(raw.group_cover),
      unread: numOf(raw.unread_count),
      pinned: numOf(raw.top_ts) > 0,
      muted: numOf(raw.is_dnd) === 1,
      followed: numOf(raw.is_follow) === 1,
      live: numOf(raw.live_status) === 1,
      systemType,
      preview: previewOf(last),
      time: numOf(last?.timestamp) || Math.floor(numOf(raw.session_ts) / 1e6),
      sessionTs: numOf(raw.session_ts),
      maxSeqno: idOf(raw.max_seqno),
    };
  }

  private async fillSessionProfiles(items: MessageSession[]): Promise<void> {
    const missing = items.filter(
      (item) => item.sessionType === 1 && item.systemType === 0 && !item.name,
    );
    if (missing.length === 0) return;
    const uids = [...new Set(missing.map((item) => item.talkerId))].slice(
      0,
      50,
    );
    const profiles = await this.fetchProfiles(uids);
    for (const item of missing) {
      const profile = profiles.get(item.talkerId);
      if (!profile) {
        item.name = `用户 ${item.talkerId}`;
        continue;
      }
      item.name = profile.name || item.name || `用户 ${item.talkerId}`;
      item.face = profile.face || item.face;
    }
  }

  private async fetchProfiles(
    uids: string[],
  ): Promise<Map<string, { name: string; face: string }>> {
    const map = new Map<string, { name: string; face: string }>();
    if (uids.length === 0) return map;
    const paths = ["/account/v1/user/cards", "/account/v1/user/infos"];
    for (const path of paths) {
      try {
        const res = await this.vcClient.get(path, {
          params: { uids: uids.join(","), ...WEB },
          validateStatus: () => true,
        });
        if (numOf(asRecord(res.data)?.code) !== 0) continue;
        const data = asRecord(res.data)?.data;
        const list = Array.isArray(data)
          ? data
          : asArray(
              asRecord(data)?.cards ??
                asRecord(data)?.infos ??
                asRecord(data)?.list,
            );
        for (const raw of list) {
          const user = asRecord(raw);
          if (!user) continue;
          const mid = idOf(user.mid ?? user.uid);
          if (!mid) continue;
          map.set(mid, {
            name: textOf(user.name ?? user.uname ?? user.nickname),
            face: httpsUrl(user.face ?? user.avatar),
          });
        }
        if (map.size > 0) return map;
      } catch {
        // 换下一个资料接口
      }
    }
    return map;
  }

  async getChat(
    talkerId: string,
    sessionType: number,
    endSeqno = "",
  ): Promise<ChatPage> {
    requireCsrf();
    const res = await this.vcClient.get(
      "/svr_sync/v1/svr_sync/fetch_session_msgs",
      {
        params: {
          talker_id: talkerId,
          session_type: sessionType,
          size: 30,
          sender_device_id: 1,
          ...WEB,
          ...(endSeqno ? { end_seqno: endSeqno } : {}),
        },
        validateStatus: () => true,
      },
    );
    const data = assertOk(res.data, "聊天记录获取失败");
    const mine = selfMid();
    const messages = asArray(data.messages)
      .map((item) => toChatMessage(asRecord(item) ?? {}, mine))
      .filter((item): item is ChatMessage => Boolean(item))
      .reverse();
    const emotes: ChatEmote[] = asArray(data.e_infos)
      .map((item) => {
        const emote = asRecord(item);
        const text = textOf(emote?.text);
        const url = httpsUrl(emote?.url ?? emote?.gif_url);
        return text && url ? { text, url } : null;
      })
      .filter((item): item is ChatEmote => Boolean(item));
    return {
      messages,
      emotes,
      hasMore: numOf(data.has_more) === 1,
      minSeqno: idOf(data.min_seqno),
      maxSeqno: idOf(data.max_seqno),
    };
  }

  private async postChat(
    talkerId: string,
    sessionType: number,
    msgType: number,
    content: Record<string, unknown>,
  ): Promise<void> {
    const sender = selfMid();
    if (!sender) throw new Error("请先登录后再发送消息");
    const query = await signParams({
      w_sender_uid: sender,
      w_receiver_id: talkerId,
      w_dev_id: this.devId,
    });
    const csrf = requireCsrf();
    const body = new URLSearchParams({
      "msg[sender_uid]": String(sender),
      "msg[receiver_id]": talkerId,
      "msg[receiver_type]": String(sessionType || 1),
      "msg[msg_type]": String(msgType),
      "msg[msg_status]": "0",
      "msg[dev_id]": this.devId,
      "msg[timestamp]": String(Math.floor(Date.now() / 1000)),
      "msg[new_face_version]": "1",
      "msg[content]": JSON.stringify(content),
      csrf,
      csrf_token: csrf,
      build: "0",
      mobi_app: "web",
    });
    const res = await this.vcClient.post("/web_im/v1/web_im/send_msg", body, {
      params: query,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true,
    });
    assertOk(res.data, "发送失败");
  }

  async sendChat(
    talkerId: string,
    sessionType: number,
    text: string,
  ): Promise<void> {
    const content = text.trim();
    if (!content) throw new Error("消息不能为空");
    if (content.length > 500) throw new Error("消息不能超过 500 字");
    await this.postChat(talkerId, sessionType, 1, { content });
  }

  async sendChatImage(
    talkerId: string,
    sessionType: number,
    file: { name: string; mime: string; data: Uint8Array },
  ): Promise<void> {
    const bytes = Buffer.from(file.data);
    if (bytes.length === 0) throw new Error("图片是空的");
    if (bytes.length > 20 * 1024 * 1024) throw new Error("图片不能超过 20MB");
    const imageType = imageTypeOf(file.name, file.mime);
    const csrf = requireCsrf();
    const form = new FormData();
    form.append(
      "file_up",
      new Blob([Uint8Array.from(bytes)], { type: file.mime || "image/jpeg" }),
      file.name || `image.${imageType}`,
    );
    form.append("biz", "im");
    form.append("csrf", csrf);
    form.append("csrf_token", csrf);
    const uploaded = await this.client.post(
      "/x/dynamic/feed/draw/upload_bfs",
      form,
      { validateStatus: () => true },
    );
    const data = assertOk(uploaded.data, "图片上传失败");
    const url = httpsUrl(data.image_url);
    if (!url) throw new Error("图片上传失败");
    await this.postChat(talkerId, sessionType, 2, {
      url,
      width: numOf(data.image_width),
      height: numOf(data.image_height),
      imageType,
      size: numOf(data.img_size),
      original: 1,
    });
  }

  async markRead(
    talkerId: string,
    sessionType: number,
    ackSeqno = "",
  ): Promise<void> {
    await this.postForm(
      this.vcClient,
      "/session_svr/v1/session_svr/update_ack",
      {
        talker_id: talkerId,
        session_type: String(sessionType || 1),
        ...(ackSeqno ? { ack_seqno: ackSeqno } : {}),
      },
      "标记已读失败",
    );
  }

  async setPinned(
    talkerId: string,
    sessionType: number,
    pinned: boolean,
  ): Promise<void> {
    await this.postForm(
      this.vcClient,
      "/session_svr/v1/session_svr/set_top",
      {
        talker_id: talkerId,
        session_type: String(sessionType || 1),
        op_type: pinned ? "0" : "1",
      },
      "置顶失败",
    );
  }

  async setMuted(
    talkerId: string,
    sessionType: number,
    muted: boolean,
  ): Promise<void> {
    const uid = selfMid();
    const fields: Record<string, string> = {
      uid: String(uid),
      setting: muted ? "1" : "0",
    };
    if (sessionType === 2) fields.dnd_group_id = talkerId;
    else fields.dnd_uid = talkerId;
    await this.postForm(
      this.vcClient,
      "/link_setting/v1/link_setting/set_msg_dnd",
      fields,
      "免打扰设置失败",
    );
  }

  async removeSession(talkerId: string, sessionType: number): Promise<void> {
    await this.postForm(
      this.vcClient,
      "/session_svr/v1/session_svr/remove_session",
      {
        talker_id: talkerId,
        session_type: String(sessionType || 1),
      },
      "移除会话失败",
    );
  }

  async recall(
    talkerId: string,
    sessionType: number,
    msgKey: string,
  ): Promise<void> {
    await this.postForm(
      this.vcClient,
      "/web_im/v1/web_im/recall_msg",
      {
        talker_id: talkerId,
        session_type: String(sessionType || 1),
        msg_key: msgKey,
        sender_uid: String(selfMid()),
      },
      "撤回失败",
    );
  }

  async getFeed(
    kind: MessageFeedKind,
    cursorId = 0,
    cursorTime = 0,
  ): Promise<MessageFeedPage> {
    requireCsrf();
    const timeKey =
      kind === "reply" ? "reply_time" : kind === "at" ? "at_time" : "like_time";
    const res = await this.client.get(FEED_PATH[kind], {
      params: {
        platform: "web",
        ...WEB,
        ps: 20,
        ...(cursorId > 0 ? { id: cursorId, [timeKey]: cursorTime } : {}),
      },
      validateStatus: () => true,
    });
    const data = assertOk(res.data, "消息获取失败");
    const total = asRecord(data.total);
    const cursor = asRecord(data.cursor) ?? asRecord(total?.cursor) ?? {};
    const rows = asArray(data.items ?? total?.items);
    return {
      items: rows
        .map(toFeedItem)
        .filter((item): item is MessageFeedItem => Boolean(item?.id)),
      cursorId: numOf(cursor.id),
      cursorTime: numOf(cursor.time),
      isEnd: cursor.is_end === true || numOf(cursor.is_end) === 1,
    };
  }

  async getMyReplies(
    cursorId = 0,
    cursorTime = 0,
    keyword = "",
  ): Promise<MessageFeedPage> {
    requireCsrf();
    const term = keyword.trim().toLowerCase();
    const seen = new Set<string>();
    const items: MessageFeedItem[] = [];
    let nextId = cursorId;
    let nextTime = cursorTime;
    let isEnd = false;
    for (let hop = 0; hop < 4 && items.length < 12 && !isEnd; hop += 1) {
      const res = await this.client.get("/x/msgfeed/reply", {
        params: {
          platform: "web",
          ...WEB,
          ps: 20,
          ...(nextId > 0 ? { id: nextId, reply_time: nextTime } : {}),
        },
        validateStatus: () => true,
      });
      const data = assertOk(res.data, "我回复的加载失败");
      const total = asRecord(data.total);
      const cursor = asRecord(data.cursor) ?? asRecord(total?.cursor) ?? {};
      const rows = asArray(data.items ?? total?.items);
      nextId = numOf(cursor.id);
      nextTime = numOf(cursor.time);
      isEnd =
        cursor.is_end === true ||
        numOf(cursor.is_end) === 1 ||
        rows.length === 0;
      for (const row of rows) {
        const mine = toMyReplyFromNotice(row);
        if (!mine || seen.has(mine.id)) continue;
        const haystack =
          `${mine.content} ${mine.quote} ${mine.title}`.toLowerCase();
        if (term && !haystack.includes(term)) continue;
        seen.add(mine.id);
        items.push(mine);
      }
      if (nextId <= 0) isEnd = true;
    }
    return { items, cursorId: nextId, cursorTime: nextTime, isEnd };
  }

  async deleteFeed(kind: MessageFeedKind, id: string): Promise<void> {
    await this.postForm(
      this.client,
      "/x/msgfeed/del",
      { id, tp: FEED_TP[kind] },
      "删除通知失败",
    );
  }

  async getNotices(cursor = ""): Promise<SystemNoticePage> {
    requireCsrf();
    const attempts: Array<() => Promise<SystemNoticePage>> = [
      () =>
        this.readNotices(
          this.messageClient,
          "/x/sys-msg/query_unified_notify",
          { page_size: 20, cursor, ...WEB },
        ),
      () =>
        this.readNotices(this.messageClient, "/x/sys-msg/query_notify_list", {
          page_size: 20,
          cursor,
          data_type: 1,
          ...WEB,
        }),
      () =>
        this.readNotices(this.client, "/x/sys-msg/query_user_notify", {
          page_size: 20,
          cursor,
          ...WEB,
        }),
    ];
    let lastError = "系统通知获取失败";
    for (const attempt of attempts) {
      try {
        const page = await attempt();
        if (!cursor) void this.markNoticesRead(page.cursor);
        return page;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
    throw new Error(lastError);
  }

  private async readNotices(
    client: AxiosInstance,
    path: string,
    params: Record<string, string | number>,
  ): Promise<SystemNoticePage> {
    const res = await client.get(path, {
      params,
      validateStatus: () => true,
    });
    const data = assertOk(res.data, "系统通知获取失败");
    const items = noticeArray(data)
      .map(toNotice)
      .filter((item): item is SystemNotice => Boolean(item));
    const next = idOf(data.cursor) || items[items.length - 1]?.cursor || "";
    const hasMore = numOf(data.has_more);
    return {
      items,
      cursor: next,
      isEnd: hasMore === 0 || items.length === 0 || next === params.cursor,
    };
  }

  private async markNoticesRead(cursor: string): Promise<void> {
    if (!cursor) return;
    try {
      await this.postForm(
        this.messageClient,
        "/x/sys-msg/update_cursor",
        { cursor, id: cursor },
        "系统通知已读失败",
      );
    } catch {
      // 列表已经拿到，已读失败不打断页面
    }
  }

  async getSettings(): Promise<MessageSettings> {
    requireCsrf();
    const res = await this.vcClient.get("/link_setting/v1/link_setting/get", {
      params: {
        ...WEB,
        msg_notify: 1,
        show_unfollowed_msg: 1,
        unfollowed_fold: 1,
        is_group_fold: 1,
      },
      validateStatus: () => true,
    });
    const data = assertOk(res.data, "消息设置获取失败");
    const flag = (key: string, fallback: boolean) => {
      if (data[key] == null) return fallback;
      return numOf(data[key]) === 1;
    };
    return {
      msgNotify: flag("msg_notify", true),
      showUnfollowed: flag("show_unfollowed_msg", true),
      foldUnfollowed: flag("unfollowed_fold", false),
      foldGroup: flag("is_group_fold", false),
      blockWords: await this.readBlockWords(),
    };
  }

  async setSettings(
    patch: Partial<
      Pick<
        MessageSettings,
        "msgNotify" | "showUnfollowed" | "foldUnfollowed" | "foldGroup"
      >
    >,
  ): Promise<MessageSettings> {
    const fields: Record<string, string> = {};
    if (patch.msgNotify != null)
      fields.msg_notify = patch.msgNotify ? "1" : "0";
    if (patch.showUnfollowed != null) {
      fields.show_unfollowed_msg = patch.showUnfollowed ? "1" : "0";
    }
    if (patch.foldUnfollowed != null) {
      fields.unfollowed_fold = patch.foldUnfollowed ? "1" : "0";
    }
    if (patch.foldGroup != null) {
      fields.is_group_fold = patch.foldGroup ? "1" : "0";
    }
    await this.postForm(
      this.vcClient,
      "/link_setting/v1/link_setting/set",
      fields,
      "消息设置保存失败",
    );
    return this.getSettings();
  }

  private async readBlockWords(): Promise<string[]> {
    const attempts = [
      () =>
        this.client.get("/x/im/link_setting/get_block_words", {
          params: WEB,
          validateStatus: () => true,
        }),
      () =>
        this.vcClient.get("/link_setting/v1/link_setting/get_block_words", {
          params: WEB,
          validateStatus: () => true,
        }),
    ];
    for (const attempt of attempts) {
      try {
        const res = await attempt();
        if (numOf(asRecord(res.data)?.code) !== 0) continue;
        return wordsFrom(asRecord(res.data)?.data);
      } catch {
        // 换路径
      }
    }
    return [];
  }

  async addBlockWord(word: string): Promise<string[]> {
    const content = word.trim();
    if (!content) throw new Error("屏蔽词不能为空");
    if (content.length > 20) throw new Error("屏蔽词最多 20 个字");
    await this.writeBlockWord("add", content);
    return this.readBlockWords();
  }

  async removeBlockWord(word: string): Promise<string[]> {
    const content = word.trim();
    if (!content) return this.readBlockWords();
    await this.writeBlockWord("del", content);
    return this.readBlockWords();
  }

  private async writeBlockWord(
    action: "add" | "del",
    word: string,
  ): Promise<void> {
    const path =
      action === "add"
        ? "/x/im/link_setting/add_block_word"
        : "/x/im/link_setting/del_block_word";
    const vcPath =
      action === "add"
        ? "/link_setting/v1/link_setting/add_block_word"
        : "/link_setting/v1/link_setting/del_block_word";
    const fields = { content: word, word };
    try {
      await this.postForm(this.client, path, fields, "屏蔽词保存失败");
    } catch {
      await this.postForm(this.vcClient, vcPath, fields, "屏蔽词保存失败");
    }
  }
}

export const messageApi = new MessageApiService();
