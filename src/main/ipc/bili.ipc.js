import { BrowserWindow, dialog, ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore } from "../store/app-store";
import { listFootprint, removeFootprintComments, } from "../store/footprint-store";
import { abortFootprintSync, getFootprintSyncStatus, startFootprintSync, } from "../services/footprint-sync";
import { biliApi } from "../services/bili-api";
import { classifyCollections, fetchLocalCollections, getCollectionGroups, renameCollectionGroup, setCollectionGroup, } from "../services/collection-classifier";
import { messageApi } from "../services/message-api";
import { cancelFollowTagSync, getFollowTagSyncStatus, previewFollowTagSync, startFollowTagSync, } from "../services/follow-tag-sync";
import { localToViewRepo } from "../db/repositories/local-toview";
import { buildFavClassifyText, matchTitleToCategory, pickClassifyCommentSnippets, suggestExistingFavFolderTitle, } from "../services/fav-classifier";
import { clearIntegrityArchive, dismissAbnormalFollowing, dismissInvalidVideo, getIntegrityArchive, runIntegrityScan, } from "../services/integrity-scan";
import { clearUpActivityArchive, getUpActivityArchive, removeUpActivityRecords, runUpActivityScan, } from "../services/up-activity-scan";
import { fetchMediaRange } from "../services/media-proxy";
import { handleIpc } from "./safe-handler";
export function registerBiliIpc() {
    ipcMain.handle(IPC.BILI_RECOMMEND, (_e, options) => biliApi.getRecommend(options));
    handleIpc(IPC.BILI_POPULAR_ALL, () => biliApi.getAllPopularVideos());
    handleIpc(IPC.BILI_POPULAR, (_e, page) => biliApi.getPopularVideos(page ?? 1));
    handleIpc(IPC.BILI_WEEKLY_SERIES_LIST, () => biliApi.getWeeklySeriesList());
    handleIpc(IPC.BILI_WEEKLY_SERIES, (_e, number) => biliApi.getWeeklySeries(number));
    handleIpc(IPC.BILI_PRECIOUS, () => biliApi.getPreciousVideos());
    handleIpc(IPC.BILI_RANKING, (_e, rid) => biliApi.getRankingVideos(rid ?? 0));
    handleIpc(IPC.BILI_MUSIC_RANK_PERIODS, () => biliApi.getMusicRankPeriods());
    handleIpc(IPC.BILI_MUSIC_RANK_LIST, (_e, listId) => biliApi.getMusicRankList(listId));
    ipcMain.handle(IPC.BILI_LIVE_RECOMMEND, (_e, page) => biliApi.getLiveRecommend(page));
    ipcMain.handle(IPC.BILI_LIVE_FOLLOWING, () => biliApi.getFollowingLives());
    ipcMain.handle(IPC.BILI_LIVE_ROOM, (_e, roomId) => biliApi.getLiveRoom(roomId));
    ipcMain.handle(IPC.BILI_LIVE_PLAY_URL, (_e, roomId, qn) => biliApi.getLivePlayUrl(roomId, qn));
    handleIpc(IPC.BILI_LIVE_DANMU_INFO, (_e, roomId) => biliApi.getLiveDanmuInfo(roomId));
    handleIpc(IPC.BILI_LIVE_DANMU_HISTORY, (_e, roomId) => biliApi.getLiveDanmuHistory(roomId));
    handleIpc(IPC.BILI_LIVE_EMOTES, (_e, roomId) => biliApi.getLiveEmotes(roomId));
    handleIpc(IPC.BILI_LIVE_DANMU_SEND, (_e, roomId, message) => biliApi.sendLiveDanmu(roomId, message));
    handleIpc(IPC.BILI_LIVE_ROOM_VIEWERS, (_e, roomId, uid) => biliApi.getLiveRoomViewers(roomId, uid));
    ipcMain.handle(IPC.BILI_VIDEO, (_e, bvid) => biliApi.getVideo(bvid));
    handleIpc(IPC.BILI_RELATED_VIDEOS, (_e, bvid) => biliApi.getRelatedVideos(bvid));
    handleIpc(IPC.BILI_VIDEO_ONLINE, (_e, aid, cid, bvid) => biliApi.getVideoOnlineTotal(aid, cid, bvid));
    handleIpc(IPC.BILI_VIDEO_SUBTITLES, (_e, bvid, cid) => biliApi.getVideoSubtitles(bvid, cid));
    ipcMain.handle(IPC.BILI_PLAY_URL, (_e, bvid, cid, qn, options) => biliApi.getPlayUrl(bvid, cid, qn, options));
    ipcMain.handle(IPC.BILI_MEDIA_RANGE, (_e, url, range, referer) => fetchMediaRange(url, referer, range));
    ipcMain.handle(IPC.BILI_VIDEO_RELATION, (_e, bvid, aid) => biliApi.getVideoRelation(bvid, aid));
    ipcMain.handle(IPC.BILI_VIDEO_DISLIKE, (_e, aid, dislike) => biliApi.dislikeVideo(aid, dislike));
    ipcMain.handle(IPC.BILI_VIDEO_HEATMAP, (_e, bvid, cid) => biliApi.getVideoHeatmap(bvid, cid));
    ipcMain.handle(IPC.BILI_VIDEO_NOTES, (_e, aid) => biliApi.getArchiveNotes(aid));
    ipcMain.handle(IPC.BILI_VIDEO_NOTE_ADD, (_e, aid, title, text) => biliApi.addArchiveNote(aid, title, text));
    ipcMain.handle(IPC.BILI_VIDEO_DOWNLOAD, async (event, bvid, cid, qn) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const picked = await (win
            ? dialog.showSaveDialog(win, {
                defaultPath: `${bvid}.mp4`,
                filters: [{ name: "视频", extensions: ["mp4", "flv"] }],
            })
            : dialog.showSaveDialog({
                defaultPath: `${bvid}.mp4`,
                filters: [{ name: "视频", extensions: ["mp4", "flv"] }],
            }));
        if (picked.canceled || !picked.filePath)
            return false;
        await biliApi.downloadVideoFile(bvid, cid, picked.filePath, qn);
        return true;
    });
    ipcMain.handle(IPC.BILI_SEASON, (_e, kind, id, by) => biliApi.getSeason(kind, id, by ?? "season"));
    ipcMain.handle(IPC.BILI_SEASON_PLAY, (_e, kind, epId, cid, qn) => biliApi.getSeasonPlayUrl(kind, epId, cid, qn));
    ipcMain.handle(IPC.BILI_SEASON_FOLLOW, (_e, kind, seasonId, follow) => biliApi.setSeasonFollow(kind, seasonId, follow));
    ipcMain.handle(IPC.BILI_CHANNEL_VIDEOS, (_e, channelId, page) => biliApi.getChannelVideos(channelId, page ?? 1));
    ipcMain.handle(IPC.BILI_AUDIO_SONG, (_e, sid) => biliApi.getAudioSong(sid));
    ipcMain.handle(IPC.BILI_PROFILE_UPDATE, (_e, input) => biliApi.updateMyProfile(input));
    ipcMain.handle(IPC.BILI_PROFILE_FACE, (_e, file) => biliApi.updateMyFace(file));
    ipcMain.handle(IPC.BILI_WALLET, () => biliApi.getWallet());
    ipcMain.handle(IPC.BILI_CLASSIFY_TITLES, (_e, items) => {
        const out = {};
        for (const item of Array.isArray(items) ? items : []) {
            if (!item?.key)
                continue;
            const text = buildFavClassifyText({
                title: String(item.title ?? ""),
                upper: { name: String(item.upper ?? "") },
            });
            const matched = matchTitleToCategory(text);
            if (!matched)
                continue;
            const entry = {
                l1: matched.l1,
            };
            if (matched.l2)
                entry.l2 = matched.l2;
            if (matched.l3)
                entry.l3 = matched.l3;
            out[item.key] = entry;
        }
        return out;
    });
    ipcMain.handle(IPC.BILI_VIDEO_LIKE, (_e, aid, like) => biliApi.likeVideo(aid, like));
    ipcMain.handle(IPC.BILI_VIDEO_COIN, (_e, payload) => biliApi.addCoin(payload));
    ipcMain.handle(IPC.BILI_VIDEO_SHARE, (_e, aid, bvid) => biliApi.shareVideo(aid, bvid));
    ipcMain.handle(IPC.BILI_WATCH_HEARTBEAT, (_e, payload) => biliApi.reportWatchHeartbeat(payload));
    ipcMain.handle(IPC.BILI_DANMAKU_LIST, (_e, cid) => biliApi.getDanmakuList(cid));
    ipcMain.handle(IPC.BILI_DANMAKU_SEND, (_e, payload) => biliApi.sendDanmaku(payload));
    handleIpc(IPC.BILI_COMMAND_DANMAKU_LIST, async (_e, ...args) => {
        const aid = Number(args[0]) || 0;
        const cid = Number(args[1]) || 0;
        return biliApi.getCommandDanmakuList(aid, cid);
    });
    handleIpc(IPC.BILI_COMMAND_GRADE_POST, async (_e, ...args) => biliApi.postCommandGrade(args[0]));
    handleIpc(IPC.BILI_COMMAND_VOTE_POST, async (_e, ...args) => biliApi.postCommandVote(args[0]));
    ipcMain.handle(IPC.BILI_COMMENT_LIST, (_e, aid, page, sort, offset, seekRpid) => biliApi.getComments(aid, page, sort, offset ?? "", seekRpid ?? 0));
    ipcMain.handle(IPC.BILI_COMMENT_REPLIES, (_e, aid, root, page) => biliApi.getCommentReplies(aid, root, page));
    ipcMain.handle(IPC.BILI_COMMENT_ADD, (_e, aid, message, root, parent, images) => biliApi.addComment(aid, message, root, parent, images));
    ipcMain.handle(IPC.BILI_COMMENT_LIKE, (_e, aid, rpid, like) => biliApi.likeComment(aid, rpid, like));
    handleIpc(IPC.BILI_COMMENT_HATE, (_e, oid, type, rpid, hate) => biliApi.hateComment(oid, type, rpid, hate));
    handleIpc(IPC.BILI_COMMENT_DELETE, async (_e, oid, type, rpid) => {
        await biliApi.deleteReply(oid, type, rpid);
        const uid = Number(appStore.get("cookies").DedeUserID) ||
            Number(appStore.get("user")?.mid) ||
            0;
        if (uid > 0)
            removeFootprintComments(uid, [String(rpid)]);
    });
    handleIpc(IPC.BILI_COMMENT_PIN, (_e, oid, type, rpid, pin) => biliApi.pinComment(oid, type, rpid, pin));
    handleIpc(IPC.BILI_COMMENT_REPORT, (_e, oid, type, rpid, reason) => biliApi.reportComment(oid, type, rpid, reason));
    handleIpc(IPC.BILI_COMMENT_TRANSLATE, (_e, oid, type, rpid) => biliApi.translateComment(oid, type, rpid));
    ipcMain.handle(IPC.BILI_REPLY_EMOTES, () => biliApi.getReplyEmotes());
    ipcMain.handle(IPC.BILI_FAV_FOLDERS, () => biliApi.getFavFolders());
    ipcMain.handle(IPC.BILI_FAV_FOLDER_CREATE, (_e, payload) => biliApi.createFavFolder(payload));
    ipcMain.handle(IPC.BILI_FAV_FOLDER_INFO, (_e, mediaId) => biliApi.getFavFolderInfo(mediaId));
    ipcMain.handle(IPC.BILI_FAV_FOLDER_EDIT, (_e, payload) => biliApi.editFavFolder(payload));
    ipcMain.handle(IPC.BILI_FAV_FOLDER_DELETE, (_e, mediaId) => biliApi.deleteFavFolder(mediaId));
    ipcMain.handle(IPC.BILI_FAV_FOLDER_SORT, (_e, mediaIds) => biliApi.sortFavFolders(mediaIds));
    ipcMain.handle(IPC.BILI_VIDEO_FAV_FOLDERS, (_e, aid) => biliApi.getVideoFavFolders(aid));
    ipcMain.handle(IPC.BILI_FAV_FOLDER_SUGGEST, async (_e, payload) => {
        let comments = "";
        const aid = Number(payload?.aid);
        if (Number.isFinite(aid) && aid > 0) {
            try {
                const texts = await biliApi.getHotCommentTexts(aid, 8);
                comments = pickClassifyCommentSnippets(texts);
            }
            catch {
                comments = "";
            }
        }
        const text = buildFavClassifyText({
            title: payload?.title ?? "",
            intro: payload?.intro,
            upper: { name: payload?.ownerName },
            comments,
        });
        const title = suggestExistingFavFolderTitle(text, payload?.folderTitles ?? []);
        return title ? { title } : null;
    });
    ipcMain.handle(IPC.BILI_VIDEO_FAV_SET, (_e, aid, addMediaIds, delMediaIds) => biliApi.setVideoFavFolders(aid, addMediaIds, delMediaIds));
    ipcMain.handle(IPC.BILI_FAV_RESOURCES, (_e, mediaId, page, riskRetry, expectedCount) => biliApi.getFavResources(mediaId, page ?? 1, 20, riskRetry === "long" ? "long" : "short", Number(expectedCount) || 0));
    ipcMain.handle(IPC.BILI_FAV_RESOURCES_REMOVE, (_e, mediaId, aids) => biliApi.removeFavResources(mediaId, aids));
    ipcMain.handle(IPC.BILI_FAV_RESOURCES_MOVE, (_e, srcMediaId, tarMediaId, aids) => biliApi.moveFavResources(srcMediaId, tarMediaId, aids));
    ipcMain.handle(IPC.BILI_FAV_RESOURCES_CLEAN, (_e, mediaId) => biliApi.cleanFavResources(mediaId));
    ipcMain.handle(IPC.BILI_FOLLOWINGS, (_e, page, order) => biliApi.getFollowings(page, order ?? "recent"));
    ipcMain.handle(IPC.BILI_FOLLOW_TAGS, () => biliApi.getFollowTags());
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_CREATE, (_e, name) => biliApi.createFollowTag(name));
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_RENAME, (_e, tagId, name) => biliApi.renameFollowTag(tagId, name));
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_DELETE, (_e, tagId) => biliApi.deleteFollowTag(tagId));
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_SYNC_PREVIEW, (_e, followedMids) => previewFollowTagSync(Array.isArray(followedMids) ? followedMids : []));
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_SYNC_START, (_e, planId) => startFollowTagSync(planId));
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_SYNC_STATUS, () => getFollowTagSyncStatus());
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_SYNC_CANCEL, () => cancelFollowTagSync());
    ipcMain.handle(IPC.BILI_FOLLOW_TAG_MEMBERS, (_e, tagId, page, order) => biliApi.getFollowingsInTag(tagId, page, 50, order ?? "recent"));
    handleIpc(IPC.BILI_USER_RELATION_LIST, (_e, mid, type, page) => biliApi.getUserRelationList(mid, type, page));
    ipcMain.handle(IPC.BILI_FOLLOW_USER_TAGS, (_e, mid) => biliApi.getUserFollowTags(mid));
    ipcMain.handle(IPC.BILI_FOLLOW_USER_TAGS_SET, (_e, mid, tagIds) => biliApi.setUserFollowTags(mid, tagIds));
    handleIpc(IPC.BILI_UP_PROFILE, (_e, mid) => biliApi.getUpProfile(mid));
    handleIpc(IPC.BILI_UP_RELATION, (_e, mid) => biliApi.getUpRelation(mid));
    handleIpc(IPC.BILI_UP_MODIFY_FOLLOW, (_e, mid, follow) => biliApi.modifyFollow(mid, follow));
    handleIpc(IPC.BILI_UP_MODIFY_SPECIAL, (_e, mid, special) => biliApi.modifySpecialFollow(mid, special));
    handleIpc(IPC.BILI_BLACKLIST, (_e, page) => biliApi.getBlacklist(page ?? 1));
    handleIpc(IPC.BILI_UP_MODIFY_BLOCK, (_e, mid, block) => biliApi.modifyBlock(mid, block));
    handleIpc(IPC.BILI_UP_VIDEOS, (_e, mid, page, order, keyword, specialType) => biliApi.getUpVideos(mid, page, order, keyword ?? "", specialType ?? ""));
    handleIpc(IPC.BILI_UP_COURSES, (_e, mid, page) => biliApi.getUpCourses(mid, page ?? 1));
    handleIpc(IPC.BILI_SEARCH, (_e, keyword, page, order, apiStartPage, pageSize) => biliApi.searchVideos(keyword, page, order, apiStartPage, pageSize));
    handleIpc(IPC.BILI_CHARGE_BADGES, (_e, bvids) => biliApi.lookupChargeBadges(Array.isArray(bvids) ? bvids : []));
    handleIpc(IPC.BILI_SEARCH_USERS, (_e, keyword, page, order, userType) => biliApi.searchUsers(keyword, page, order, userType));
    handleIpc(IPC.BILI_SEARCH_ARTICLES, (_e, keyword, page, order) => biliApi.searchArticles(keyword, page, order));
    handleIpc(IPC.BILI_SEARCH_MEDIA, (_e, keyword, kind, page) => biliApi.searchMedia(keyword, kind, page));
    handleIpc(IPC.BILI_SEARCH_LIVE, (_e, keyword, page, order) => biliApi.searchLiveRooms(keyword, page, order));
    handleIpc(IPC.BILI_SEARCH_SUGGEST, (_e, term) => biliApi.getSearchSuggest(term));
    handleIpc(IPC.BILI_SEARCH_TYPE_COUNTS, (_e, keyword) => biliApi.getSearchTypeCounts(keyword));
    handleIpc(IPC.BILI_TOVIEW_LIST, () => biliApi.getToViewList());
    handleIpc(IPC.BILI_TOVIEW_ADD, async (_e, aid, bvid, video, forceLocal) => {
        const aidNum = Number(aid) || 0;
        const bvidStr = String(bvid ?? "").trim();
        if (!bvidStr)
            throw new Error("缺少视频信息，无法加入稍后再看");
        if (forceLocal) {
            return {
                source: "local",
                item: localToViewRepo.add(video, aidNum, bvidStr),
            };
        }
        try {
            await biliApi.addToView(aidNum, bvidStr);
            localToViewRepo.remove(bvidStr);
            return { source: "official" };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("TOVIEW_FULL")) {
                return {
                    source: "local",
                    item: localToViewRepo.add(video, aidNum, bvidStr),
                };
            }
            throw error;
        }
    });
    handleIpc(IPC.BILI_TOVIEW_REMOVE, (_e, aid) => biliApi.removeFromToView(aid));
    handleIpc(IPC.BILI_TOVIEW_CLEAR, () => biliApi.clearToView());
    handleIpc(IPC.BILI_TOVIEW_LOCAL_LIST, async () => {
        const videos = localToViewRepo.list();
        return { videos, count: videos.length };
    });
    handleIpc(IPC.BILI_TOVIEW_LOCAL_REMOVE, async (_e, bvid) => {
        if (Array.isArray(bvid)) {
            localToViewRepo.removeMany(bvid.map((item) => String(item ?? "")));
            return;
        }
        localToViewRepo.remove(String(bvid ?? ""));
    });
    handleIpc(IPC.BILI_INTEGRITY_ARCHIVE, async () => getIntegrityArchive());
    ipcMain.handle(IPC.BILI_INTEGRITY_CLEAR, (_e, scope) => {
        const next = scope === "favorites" || scope === "toview" || scope === "following"
            ? scope
            : undefined;
        return clearIntegrityArchive(next);
    });
    ipcMain.handle(IPC.BILI_INTEGRITY_DISMISS_VIDEO, (_e, id) => dismissInvalidVideo(String(id ?? "")));
    ipcMain.handle(IPC.BILI_INTEGRITY_DISMISS_FOLLOWING, (_e, mid) => dismissAbnormalFollowing(Number(mid) || 0));
    ipcMain.handle(IPC.BILI_INTEGRITY_SCAN, async (event, scope) => {
        const next = scope === "toview" || scope === "following" || scope === "favorites"
            ? scope
            : "favorites";
        return runIntegrityScan(next, (progress) => {
            try {
                event.sender.send(IPC.BILI_INTEGRITY_PROGRESS, progress);
            }
            catch {
                // sender may be gone
            }
        });
    });
    handleIpc(IPC.BILI_UP_ACTIVITY_ARCHIVE, async () => getUpActivityArchive());
    ipcMain.handle(IPC.BILI_UP_ACTIVITY_CLEAR, () => clearUpActivityArchive());
    handleIpc(IPC.BILI_UP_ACTIVITY_REMOVE, (_e, mids) => removeUpActivityRecords(Array.isArray(mids) ? mids : []));
    ipcMain.handle(IPC.BILI_UP_ACTIVITY_SCAN, async (event) => {
        return runUpActivityScan((progress) => {
            try {
                event.sender.send(IPC.BILI_UP_ACTIVITY_PROGRESS, progress);
            }
            catch {
                // sender may be gone
            }
        });
    });
    handleIpc(IPC.BILI_SPACE_DYNAMICS, (_e, mid, offset) => biliApi.getSpaceDynamics(mid, offset));
    handleIpc(IPC.BILI_SPACE_OPUS, (_e, mid, offset) => biliApi.getSpaceOpus(mid, offset));
    handleIpc(IPC.BILI_FOLLOW_DYNAMICS, (_e, offset, type) => biliApi.getFollowDynamics(offset ?? "", type ?? "all"));
    handleIpc(IPC.BILI_DYNAMIC_DETAIL, (_e, id) => biliApi.getDynamicDetail(id));
    handleIpc(IPC.BILI_DYNAMIC_VOTE, (_e, voteId, optionIdxs) => biliApi.doDynamicVote(voteId, optionIdxs));
    handleIpc(IPC.BILI_DYNAMIC_LIKE, (_e, id, like) => biliApi.likeDynamic(id, like));
    handleIpc(IPC.BILI_DYNAMIC_FAV, (_e, id, favorite) => biliApi.favoriteDynamic(id, favorite));
    handleIpc(IPC.BILI_DYNAMIC_TOP, (_e, id, top) => biliApi.setDynamicTop(id, top));
    handleIpc(IPC.BILI_DYNAMIC_REMOVE, (_e, id) => biliApi.removeDynamic(id));
    handleIpc(IPC.BILI_DYNAMIC_REPORT, (_e, id, accusedUid, reasonType) => biliApi.reportDynamic(id, accusedUid, reasonType));
    handleIpc(IPC.BILI_DYNAMIC_EQUIP_CARD, (_e, itemId) => biliApi.equipDynamicCard(itemId));
    handleIpc(IPC.BILI_DYNAMIC_CREATE, (_e, text, images, options) => biliApi.createDynamic(text, images, options));
    handleIpc(IPC.BILI_DYNAMIC_EDIT, (_e, id, text, images, options) => biliApi.editDynamic(id, text, images, options));
    handleIpc(IPC.BILI_DYNAMIC_PRIVATE, (_e, id, privatePub) => biliApi.setDynamicPrivate(id, privatePub));
    handleIpc(IPC.BILI_TOPIC_SEARCH, (_e, keyword) => biliApi.searchTopics(keyword));
    handleIpc(IPC.BILI_TOPIC_HEAD, (_e, topicId) => biliApi.getTopicHead(topicId));
    handleIpc(IPC.BILI_TOPIC_FAV, (_e, topicId, favorite) => biliApi.favoriteTopic(topicId, favorite));
    handleIpc(IPC.BILI_DYNAMIC_REPOST, (_e, id, text) => biliApi.repostDynamic(id, text ?? ""));
    handleIpc(IPC.BILI_HOT_SEARCH, () => biliApi.getHotSearch());
    handleIpc(IPC.BILI_TOPIC_FEED, (_e, topicId, offset) => biliApi.getTopicDynamics(topicId, offset ?? ""));
    handleIpc(IPC.BILI_VIDEO_CHAPTERS, (_e, bvid, cid) => biliApi.getVideoChapters(bvid, cid));
    handleIpc(IPC.BILI_VIDEO_TRIPLE, (_e, aid, bvid) => biliApi.tripleVideo(aid, bvid));
    handleIpc(IPC.BILI_VIDEO_AI_SUMMARY, (_e, bvid, cid, upMid) => biliApi.getVideoAiSummary(bvid, cid, upMid));
    handleIpc(IPC.BILI_RECOMMEND_DISLIKE, (_e, payload) => biliApi.dislikeRecommend(payload));
    handleIpc(IPC.BILI_MENTION_SUGGEST, (_e, keyword) => biliApi.getMentionSuggest(keyword));
    handleIpc(IPC.BILI_DM_HISTORY_DATES, (_e, cid, month) => biliApi.getDanmakuHistoryDates(cid, month));
    handleIpc(IPC.BILI_DM_HISTORY, (_e, cid, date) => biliApi.getDanmakuHistory(cid, date));
    handleIpc(IPC.BILI_DM_CLOUD_CONFIG, (_e, config) => biliApi.syncDanmakuConfig(config));
    handleIpc(IPC.BILI_VIDEO_SNAPSHOT, (_e, bvid, cid) => biliApi.getVideoSnapshot(bvid, cid));
    handleIpc(IPC.BILI_VIP_CENTER, () => biliApi.getVipCenter());
    handleIpc(IPC.BILI_VIP_EXPERIENCE, () => biliApi.claimVipExperience());
    handleIpc(IPC.BILI_VIP_PRIVILEGES, () => biliApi.getVipPrivileges());
    handleIpc(IPC.BILI_VIP_PRIVILEGE_RECEIVE, (_e, type) => biliApi.receiveVipPrivilege(type));
    handleIpc(IPC.BILI_EXP_REWARD, () => biliApi.getExpReward());
    handleIpc(IPC.BILI_COIN_LOG, () => biliApi.getCoinLog());
    handleIpc(IPC.BILI_EXP_LOG, () => biliApi.getExpLog());
    handleIpc(IPC.BILI_FANS_MEDALS, (_e, page) => biliApi.getFansMedals(page));
    handleIpc(IPC.BILI_FANS_MEDAL_WEAR, (_e, medalId) => biliApi.wearFansMedal(medalId));
    handleIpc(IPC.BILI_DM_FILTERS, () => biliApi.getDanmakuFilters());
    handleIpc(IPC.BILI_DM_FILTER_ADD, (_e, text, kind) => biliApi.addDanmakuFilter(text, kind ?? "text"));
    handleIpc(IPC.BILI_DM_RECALL, (_e, cid, dmid) => biliApi.recallDanmaku(cid, dmid));
    handleIpc(IPC.BILI_DM_FILTER_DEL, (_e, id) => biliApi.removeDanmakuFilter(id));
    handleIpc(IPC.BILI_DM_LIKE, (_e, cid, dmid, like) => biliApi.likeDanmaku(cid, dmid, like));
    handleIpc(IPC.BILI_DM_REPORT, (_e, cid, dmid, reason) => biliApi.reportDanmaku(cid, dmid, reason ?? 11));
    handleIpc(IPC.BILI_ARTICLE_VIEW, (_e, id) => biliApi.getArticle(id));
    handleIpc(IPC.BILI_ARTICLE_LIKE, (_e, id, like) => biliApi.likeArticle(id, like));
    handleIpc(IPC.BILI_ARTICLE_COIN, (_e, id, upMid, multiply) => biliApi.coinArticle(id, upMid, multiply ?? 1));
    handleIpc(IPC.BILI_ARTICLE_FAV, (_e, id, favorite) => biliApi.favoriteArticle(id, favorite));
    handleIpc(IPC.BILI_TARGET_COMMENT_LIST, (_e, oid, type, page, sort, offset, seekRpid) => biliApi.getTargetComments(oid, type, page ?? 1, sort ?? 0, offset ?? "", seekRpid ?? 0));
    handleIpc(IPC.BILI_TARGET_COMMENT_REPLIES, (_e, oid, type, root, page) => biliApi.getTargetCommentReplies(oid, type, root, page ?? 1));
    handleIpc(IPC.BILI_TARGET_COMMENT_ADD, (_e, oid, type, message, root, parent, images) => biliApi.addTargetComment(oid, type, message, root ?? 0, parent ?? 0, images));
    handleIpc(IPC.BILI_TARGET_COMMENT_LIKE, (_e, oid, type, rpid, like) => biliApi.likeTargetComment(oid, type, rpid, like));
    handleIpc(IPC.BILI_WATCH_HISTORY, (_e, type, cursor, filters) => biliApi.getWatchHistory(type ?? "all", cursor, filters));
    handleIpc(IPC.BILI_WATCH_HISTORY_DELETE, (_e, item) => biliApi.deleteWatchHistory(item));
    handleIpc(IPC.BILI_WATCH_HISTORY_CLEAR, () => biliApi.clearWatchHistory());
    handleIpc(IPC.BILI_HISTORY_SHADOW_GET, () => biliApi.getHistoryShadow());
    handleIpc(IPC.BILI_HISTORY_SHADOW_SET, (_e, record) => biliApi.setHistoryShadow(record));
    handleIpc(IPC.BILI_USER_COLLECTIONS, (_e, mid, page) => biliApi.getUserCollections(mid, page));
    handleIpc(IPC.BILI_SEASON_ARCHIVES, (_e, mid, seasonId, page) => biliApi.getSeasonArchives(mid, seasonId, page));
    handleIpc(IPC.BILI_SERIES_ARCHIVES, (_e, seriesId, page) => biliApi.getSeriesArchives(seriesId, page));
    handleIpc(IPC.BILI_BANGUMI_FOLLOW, (_e, mid, type, page) => biliApi.getBangumiFollowList(mid, type, page));
    handleIpc(IPC.BILI_SUBSCRIBED_COLLECTIONS, (_e, page) => biliApi.getSubscribedCollections(page));
    handleIpc(IPC.BILI_COLLECTIONS_LOCAL, () => fetchLocalCollections());
    ipcMain.handle(IPC.BILI_COLLECTION_GROUPS, () => getCollectionGroups());
    ipcMain.handle(IPC.BILI_COLLECTION_GROUP_SET, (_e, key, group) => setCollectionGroup(String(key), group));
    ipcMain.handle(IPC.BILI_COLLECTION_GROUP_RENAME, (_e, l1, l2, name) => renameCollectionGroup(String(l1), l2 == null ? null : String(l2), name));
    handleIpc(IPC.BILI_COLLECTION_CLASSIFY, (event, mode) => classifyCollections(mode === "all" ? "all" : "new", (progress) => {
        try {
            event.sender.send(IPC.BILI_COLLECTION_CLASSIFY_PROGRESS, progress);
        }
        catch {
            // sender may be gone
        }
    }));
    handleIpc(IPC.BILI_UGC_SEASON_SUBSCRIBED, (_e, seasonId) => biliApi.getUgcSeasonSubscribed(seasonId));
    handleIpc(IPC.BILI_UGC_SEASON_SUBSCRIBE_SET, (_e, seasonId, subscribe) => biliApi.setUgcSeasonSubscribe(seasonId, subscribe));
    handleIpc(IPC.BILI_FAV_VIDEO_MEDIAS, (_e, page) => biliApi.getFavVideoMedias(page));
    handleIpc(IPC.BILI_OPUS_FAVORITES, (_e, page) => biliApi.getOpusFavorites(page));
    handleIpc(IPC.BILI_CHEESE_FOLLOW, (_e, page, mid) => biliApi.getCheeseFollowList(page, mid));
    handleIpc(IPC.BILI_UPOWER_PAID, () => biliApi.getUpowerPaidList());
    handleIpc(IPC.BILI_MSG_UNREAD, () => messageApi.getUnread());
    handleIpc(IPC.BILI_MSG_NEW_FANS, (_e, page) => messageApi.getNewFans(page ?? 1));
    handleIpc(IPC.BILI_MSG_SESSIONS, (_e, filter, endTs) => messageApi.getSessions(filter ?? "all", endTs ?? 0));
    handleIpc(IPC.BILI_MSG_CHAT, (_e, talkerId, sessionType, endSeqno) => messageApi.getChat(talkerId, sessionType, endSeqno ?? ""));
    handleIpc(IPC.BILI_MSG_SEND, (_e, talkerId, sessionType, text) => messageApi.sendChat(talkerId, sessionType, text));
    handleIpc(IPC.BILI_MSG_SEND_IMAGE, (_e, talkerId, sessionType, file) => messageApi.sendChatImage(talkerId, sessionType, file));
    handleIpc(IPC.BILI_MSG_SEND_SHARE, (_e, talkerId, sessionType, card) => messageApi.sendChatShare(talkerId, sessionType, card));
    handleIpc(IPC.BILI_MSG_READ, (_e, talkerId, sessionType, ackSeqno) => messageApi.markRead(talkerId, sessionType, ackSeqno ?? ""));
    handleIpc(IPC.BILI_MSG_SESSION_TOP, (_e, talkerId, sessionType, pinned) => messageApi.setPinned(talkerId, sessionType, pinned));
    handleIpc(IPC.BILI_MSG_SESSION_DND, (_e, talkerId, sessionType, muted) => messageApi.setMuted(talkerId, sessionType, muted));
    handleIpc(IPC.BILI_MSG_SESSION_REMOVE, (_e, talkerId, sessionType) => messageApi.removeSession(talkerId, sessionType));
    handleIpc(IPC.BILI_MSG_RECALL, (_e, talkerId, sessionType, msgKey) => messageApi.recall(talkerId, sessionType, msgKey));
    handleIpc(IPC.BILI_MSG_FEED, (_e, kind, cursorId, cursorTime) => messageApi.getFeed(kind, cursorId ?? 0, cursorTime ?? 0));
    handleIpc(IPC.BILI_MSG_FEED_DELETE, (_e, kind, id) => messageApi.deleteFeed(kind, id));
    handleIpc(IPC.BILI_MSG_MY_REPLIES, (_e, cursorId, cursorTime, keyword) => messageApi.getMyReplies(cursorId ?? 0, cursorTime ?? 0, keyword ?? ""));
    handleIpc(IPC.BILI_MSG_NOTICES, (_e, cursor) => messageApi.getNotices(cursor ?? ""));
    handleIpc(IPC.BILI_MSG_SETTINGS_GET, () => messageApi.getSettings());
    handleIpc(IPC.BILI_MSG_SETTINGS_SET, (_e, patch) => messageApi.setSettings(patch ?? {}));
    handleIpc(IPC.BILI_MSG_BLOCK_ADD, (_e, word) => messageApi.addBlockWord(word));
    handleIpc(IPC.BILI_MSG_BLOCK_DEL, (_e, word) => messageApi.removeBlockWord(word));
    handleIpc(IPC.BILI_FOOTPRINT_LIST, async (_e, ...args) => {
        const query = args[0] ?? {
            kind: "comment",
        };
        const uid = Number(appStore.get("cookies").DedeUserID) ||
            Number(appStore.get("user")?.mid) ||
            0;
        if (uid <= 0) {
            return {
                items: [],
                total: 0,
                syncedAt: null,
                hasMore: false,
                replyDone: false,
                danmakuDone: false,
            };
        }
        return listFootprint(uid, query);
    });
    handleIpc(IPC.BILI_FOOTPRINT_SYNC, async (_e, ...args) => {
        const kinds = args[0] ?? "all";
        const options = args[1];
        return startFootprintSync(kinds, options);
    });
    handleIpc(IPC.BILI_FOOTPRINT_SYNC_ABORT, async () => {
        abortFootprintSync();
    });
    handleIpc(IPC.BILI_FOOTPRINT_SYNC_STATUS, async () => getFootprintSyncStatus());
}
