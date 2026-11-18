import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { CommentImagePicker } from "@/components/comment/CommentImagePicker";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { Button } from "@/components/ui/button";
import { OverlayPortal, APP_OVERLAY_ZCLASS, } from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
export function PublishDynamicDialog({ open, onClose, onPublished, editId, initialText = "", keepImages = [], }) {
    const [text, setText] = useState(initialText);
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [more, setMore] = useState(false);
    const [privatePub, setPrivatePub] = useState(false);
    const [closeComment, setCloseComment] = useState(false);
    const [timer, setTimer] = useState("");
    const [mentions, setMentions] = useState([]);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionHits, setMentionHits] = useState([]);
    const [topicQuery, setTopicQuery] = useState("");
    const [topicHits, setTopicHits] = useState([]);
    const [topic, setTopic] = useState(null);
    const [voteTitle, setVoteTitle] = useState("");
    const [voteOptions, setVoteOptions] = useState("");
    const [lotteryPrize, setLotteryPrize] = useState("");
    const [lotteryFollow, setLotteryFollow] = useState(true);
    const [reserveTitle, setReserveTitle] = useState("");
    const [reserveTime, setReserveTime] = useState("");
    /** 正文里光标前正在输入的「@xxx」 */
    const [inlineMention, setInlineMention] = useState(null);
    const [inlineHits, setInlineHits] = useState([]);
    const [inlineIndex, setInlineIndex] = useState(0);
    const textareaRef = useRef(null);
    const inlineTerm = inlineMention ? inlineMention.term : null;
    useEffect(() => {
        if (inlineTerm == null) {
            setInlineHits([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void window.biliDesk.bili
                .getMentionSuggest(inlineTerm)
                .then((list) => {
                if (cancelled)
                    return;
                setInlineHits(list);
                setInlineIndex(0);
            })
                .catch(() => {
                if (!cancelled)
                    setInlineHits([]);
            });
        }, 200);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [inlineTerm]);
    useEffect(() => {
        if (!open)
            return;
        setText(initialText);
        setFiles([]);
        setError("");
        setMore(false);
        setPrivatePub(false);
        setCloseComment(false);
        setTimer("");
        setMentions([]);
        setMentionQuery("");
        setMentionHits([]);
        setTopicQuery("");
        setTopicHits([]);
        setTopic(null);
        setVoteTitle("");
        setVoteOptions("");
        setLotteryPrize("");
        setLotteryFollow(true);
        setReserveTitle("");
        setReserveTime("");
        setInlineMention(null);
    }, [open, editId, initialText]);
    if (!open)
        return null;
    const editing = Boolean(editId);
    const searchMention = async () => {
        const term = mentionQuery.trim();
        if (!term)
            return;
        const list = await window.biliDesk.bili.getMentionSuggest(term);
        setMentionHits(list.slice(0, 8).map((user) => ({ mid: user.mid, name: user.name })));
    };
    const addMention = (user) => {
        setMentions((prev) => prev.some((item) => item.mid === user.mid) ? prev : [...prev, user]);
    };
    const detectInlineMention = (value, caret) => {
        const before = value.slice(0, caret);
        const match = before.match(/@([^\s@]{0,20})$/);
        if (!match) {
            setInlineMention(null);
            return;
        }
        setInlineMention({
            start: caret - match[0].length,
            end: caret,
            term: match[1],
        });
    };
    const pickInlineMention = (user) => {
        if (!inlineMention)
            return;
        const insert = `@${user.name} `;
        const next = (text.slice(0, inlineMention.start) +
            insert +
            text.slice(inlineMention.end)).slice(0, 1000);
        const caret = inlineMention.start + insert.length;
        setText(next);
        addMention({ mid: user.mid, name: user.name });
        setInlineMention(null);
        window.requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el)
                return;
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    };
    const searchTopic = async () => {
        setTopicHits(await window.biliDesk.bili.searchTopics(topicQuery));
    };
    const submit = async () => {
        if (busy)
            return;
        setBusy(true);
        setError("");
        try {
            const images = await imageFilesToPayload(files);
            const options = {};
            if (privatePub)
                options.privatePub = true;
            if (closeComment)
                options.closeComment = true;
            if (timer) {
                const stamp = Math.floor(new Date(timer).getTime() / 1000);
                if (Number.isFinite(stamp) && stamp > Math.floor(Date.now() / 1000)) {
                    options.timerPubTime = stamp;
                }
            }
            if (mentions.length > 0)
                options.mentions = mentions;
            if (topic)
                options.topic = topic;
            if (keepImages.length > 0)
                options.keepImages = keepImages;
            const voteLines = voteOptions
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
            if (voteTitle.trim() && voteLines.length >= 2) {
                options.vote = {
                    title: voteTitle.trim(),
                    options: voteLines,
                    durationHours: 24,
                    choiceCount: 1,
                };
            }
            if (lotteryPrize.trim()) {
                options.lottery = {
                    prize: lotteryPrize.trim(),
                    durationHours: 24,
                    needFollow: lotteryFollow,
                };
            }
            if (reserveTitle.trim() && reserveTime) {
                const startTs = Math.floor(new Date(reserveTime).getTime() / 1000);
                if (Number.isFinite(startTs)) {
                    options.reserve = { title: reserveTitle.trim(), startTs };
                }
            }
            if (editing && editId) {
                await window.biliDesk.bili.editDynamic(editId, text, images, options);
                onPublished?.(editId);
            }
            else {
                const created = await window.biliDesk.bili.createDynamic(text, images, options);
                onPublished?.(created.id);
            }
            onClose();
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || (editing ? "保存失败" : "发布失败"));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn("fixed inset-0 flex items-center justify-center bg-black/55 p-4", APP_OVERLAY_ZCLASS), onClick: () => {
                if (!busy)
                    onClose();
            }, children: _jsxs("div", { className: "max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border", onClick: (event) => event.stopPropagation(), children: [_jsx("h2", { className: "text-base font-semibold", children: editing ? "编辑动态" : "发动态" }), _jsxs("div", { className: "relative mt-3", children: [_jsx("textarea", { ref: textareaRef, value: text, onChange: (event) => {
                                    const value = event.target.value.slice(0, 1000);
                                    setText(value);
                                    detectInlineMention(value, event.target.selectionStart);
                                }, onKeyDown: (event) => {
                                    if (!inlineMention || inlineHits.length === 0)
                                        return;
                                    if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        setInlineIndex((prev) => (prev + 1) % inlineHits.length);
                                    }
                                    else if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        setInlineIndex((prev) => (prev - 1 + inlineHits.length) % inlineHits.length);
                                    }
                                    else if (event.key === "Enter" || event.key === "Tab") {
                                        event.preventDefault();
                                        const hit = inlineHits[inlineIndex];
                                        if (hit)
                                            pickInlineMention(hit);
                                    }
                                    else if (event.key === "Escape") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setInlineMention(null);
                                    }
                                }, onBlur: () => window.setTimeout(() => setInlineMention(null), 150), rows: 5, placeholder: "\u5206\u4EAB\u65B0\u9C9C\u4E8B\uFF0C\u8F93\u5165 @ \u53EF\u4EE5\u63D0\u5230\u522B\u4EBA\uFF0C#\u8BDD\u9898# \u6309\u4F60\u9009\u4E2D\u7684\u8BDD\u9898\u53D1\u51FA", className: "w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" }), inlineMention && inlineHits.length > 0 && (_jsx("ul", { className: "absolute left-2 right-2 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl bg-card py-1 shadow-2xl ring-1 ring-border", children: inlineHits.map((user, index) => (_jsx("li", { children: _jsxs("button", { type: "button", className: cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", index === inlineIndex
                                            ? "bg-primary/15"
                                            : "hover:bg-secondary"), onMouseEnter: () => setInlineIndex(index), onMouseDown: (event) => {
                                            event.preventDefault();
                                            pickInlineMention(user);
                                        }, children: [user.face ? (_jsx("img", { src: user.face, alt: "", referrerPolicy: "no-referrer", className: "h-6 w-6 shrink-0 rounded-full object-cover" })) : (_jsx("span", { className: "h-6 w-6 shrink-0 rounded-full bg-secondary" })), _jsx("span", { className: "min-w-0 flex-1 truncate", children: user.name }), user.followed && (_jsx("span", { className: "shrink-0 text-[10px] text-primary", children: "\u5DF2\u5173\u6CE8" }))] }) }, user.mid))) }))] }), _jsxs("div", { className: "mt-3", children: [_jsx(CommentImagePicker, { files: files, onChange: setFiles, max: 9, disabled: busy }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [text.trim().length, "/1000 \u00B7 \u6700\u591A 9 \u5F20\u56FE", keepImages.length > 0
                                        ? ` · 保留原图 ${keepImages.length} 张`
                                        : ""] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground", children: [_jsxs("label", { className: "inline-flex items-center gap-1", children: [_jsx("input", { type: "checkbox", checked: privatePub, onChange: (event) => setPrivatePub(event.target.checked) }), "\u4EC5\u81EA\u5DF1\u53EF\u89C1"] }), _jsxs("label", { className: "inline-flex items-center gap-1", children: [_jsx("input", { type: "checkbox", checked: closeComment, onChange: (event) => setCloseComment(event.target.checked) }), "\u5173\u95ED\u8BC4\u8BBA"] }), _jsxs("label", { className: "inline-flex items-center gap-1", children: ["\u5B9A\u65F6", _jsx("input", { type: "datetime-local", value: timer, onChange: (event) => setTimer(event.target.value), className: "rounded border border-border bg-background px-1 py-0.5" })] })] }), _jsx("button", { type: "button", className: "mt-3 text-xs text-primary", onClick: () => setMore((value) => !value), children: more ? "收起 @ / 话题 / 投票" : "@ 人、话题、投票、抽奖、预约" }), more && (_jsxs("div", { className: "mt-3 space-y-3 text-sm", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: mentionQuery, onChange: (event) => setMentionQuery(event.target.value), placeholder: "\u641C\u7D22\u8981 @ \u7684\u4EBA", className: "h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm" }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void searchMention(), children: "\u641C\u7D22" })] }), _jsx("div", { className: "mt-1 flex flex-wrap gap-1", children: mentionHits.map((user) => (_jsxs("button", { type: "button", className: "rounded-full bg-secondary px-2 py-0.5 text-xs", onClick: () => {
                                                addMention(user);
                                                setText((prev) => `${prev}@${user.name} `);
                                            }, children: ["@", user.name] }, user.mid))) })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: topicQuery, onChange: (event) => setTopicQuery(event.target.value), placeholder: "\u641C\u7D22\u8BDD\u9898", className: "h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm" }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void searchTopic(), children: "\u641C\u7D22" })] }), _jsx("div", { className: "mt-1 flex flex-wrap gap-1", children: topicHits.map((item) => (_jsxs("button", { type: "button", className: "rounded-full bg-secondary px-2 py-0.5 text-xs", onClick: () => {
                                                setTopic(item);
                                                setText((prev) => prev.includes(`#${item.name}#`)
                                                    ? prev
                                                    : `${prev}#${item.name}# `);
                                            }, children: ["#", item.name] }, item.id))) }), topic && (_jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: ["\u5DF2\u9009\u8BDD\u9898 #", topic.name] }))] }), !editing && (_jsxs(_Fragment, { children: [_jsx("input", { value: voteTitle, onChange: (event) => setVoteTitle(event.target.value), placeholder: "\u6295\u7968\u6807\u9898\uFF0C\u4E0B\u9762\u4E00\u884C\u4E00\u4E2A\u9009\u9879", className: "h-8 w-full rounded-lg border border-border bg-background px-2 text-sm" }), _jsx("textarea", { value: voteOptions, onChange: (event) => setVoteOptions(event.target.value), rows: 3, placeholder: "选项一\n选项二", className: "w-full rounded-lg border border-border bg-background px-2 py-1 text-sm" }), _jsx("input", { value: lotteryPrize, onChange: (event) => setLotteryPrize(event.target.value), placeholder: "\u62BD\u5956\u5956\u54C1\uFF0C\u7559\u7A7A\u5219\u4E0D\u62BD\u5956", className: "h-8 w-full rounded-lg border border-border bg-background px-2 text-sm" }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: [_jsx("input", { type: "checkbox", checked: lotteryFollow, onChange: (event) => setLotteryFollow(event.target.checked) }), "\u62BD\u5956\u9700\u8981\u5173\u6CE8"] }), _jsx("input", { value: reserveTitle, onChange: (event) => setReserveTitle(event.target.value), placeholder: "\u76F4\u64AD\u9884\u7EA6\u6807\u9898", className: "h-8 w-full rounded-lg border border-border bg-background px-2 text-sm" }), _jsx("input", { type: "datetime-local", value: reserveTime, onChange: (event) => setReserveTime(event.target.value), className: "h-8 rounded-lg border border-border bg-background px-2 text-sm" })] }))] })), error && _jsx("p", { className: "mt-2 text-sm text-red-400", children: error }), _jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", disabled: busy, onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { disabled: busy ||
                                    (!text.trim() && files.length === 0 && keepImages.length === 0), onClick: () => void submit(), children: busy ? "提交中..." : editing ? "保存" : "发布" })] })] }) }) }));
}
