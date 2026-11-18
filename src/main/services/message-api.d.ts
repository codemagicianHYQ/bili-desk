import type { ChatPage, MessageFeedKind, MessageFeedPage, MessageSessionFilter, MessageSessionPage, MessageSettings, MessageUnread, NewFansPage, SystemNoticePage, FootprintItem } from "@shared/types";
declare class MessageApiService {
    private client;
    private vcClient;
    private messageClient;
    private devId;
    private specialCache;
    constructor();
    private postForm;
    getUnread(): Promise<MessageUnread>;
    getSessions(filter?: MessageSessionFilter, endTs?: number): Promise<MessageSessionPage>;
    private toSession;
    /**
     * 会话接口不带特别关注标记，要拉系统分组 tagid=-10 自己对。
     * 首页（含刷新）重拉，往下翻页复用，避免每页都打一遍分组接口。
     */
    private getSpecialMids;
    getNewFans(page?: number): Promise<NewFansPage>;
    private fillSessionProfiles;
    private fetchProfiles;
    getChat(talkerId: string, sessionType: number, endSeqno?: string): Promise<ChatPage>;
    private postChat;
    sendChat(talkerId: string, sessionType: number, text: string): Promise<void>;
    sendChatImage(talkerId: string, sessionType: number, file: {
        name: string;
        mime: string;
        data: Uint8Array;
    }): Promise<void>;
    sendChatShare(talkerId: string, sessionType: number, card: {
        kind: "video" | "article" | "dynamic" | "live";
        title: string;
        cover?: string;
        bvid?: string;
        aid?: number;
        cvid?: number;
        dynId?: string;
        roomId?: number;
        views?: number;
    }): Promise<void>;
    markRead(talkerId: string, sessionType: number, ackSeqno?: string): Promise<void>;
    setPinned(talkerId: string, sessionType: number, pinned: boolean): Promise<void>;
    setMuted(talkerId: string, sessionType: number, muted: boolean): Promise<void>;
    removeSession(talkerId: string, sessionType: number): Promise<void>;
    recall(talkerId: string, sessionType: number, msgKey: string): Promise<void>;
    getFeed(kind: MessageFeedKind, cursorId?: number, cursorTime?: number): Promise<MessageFeedPage>;
    getMyReplies(cursorId?: number, cursorTime?: number, keyword?: string): Promise<MessageFeedPage>;
    listSentCommentsForFootprint(maxItems?: number): Promise<FootprintItem[]>;
    private rememberSentFootprints;
    deleteFeed(kind: MessageFeedKind, id: string): Promise<void>;
    getNotices(cursor?: string): Promise<SystemNoticePage>;
    private readNotices;
    private markNoticesRead;
    getSettings(): Promise<MessageSettings>;
    setSettings(patch: Partial<Pick<MessageSettings, "msgNotify" | "showUnfollowed" | "foldUnfollowed" | "foldGroup">>): Promise<MessageSettings>;
    private readBlockWords;
    addBlockWord(word: string): Promise<string[]>;
    removeBlockWord(word: string): Promise<string[]>;
    private writeBlockWord;
}
export declare const messageApi: MessageApiService;
export {};
