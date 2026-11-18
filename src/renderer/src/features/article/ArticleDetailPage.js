import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link, useNavigate, useParams, useSearchParams, } from "react-router-dom";
import { DynamicCommentSection } from "@/features/dynamics/DynamicCommentSection";
import { BiliImage } from "@/components/ui/bili-image";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { ErrorState } from "@/components/ui/content-unavailable";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn, formatCount, formatPubdate } from "@/lib/utils";
import { Coins, Loader2, MessageCircle, Share2, Star, ThumbsUp } from "lucide-react";
const ARTICLE_COMMENT_TYPE = 12;
function formatPubTime(ts) {
    if (!ts)
        return "";
    return formatPubdate(ts);
}
export function ArticleDetailPage() {
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const focusRpid = Number(searchParams.get("rpid")) || 0;
    const focusRoot = Number(searchParams.get("root")) || 0;
    const cvid = Number(id);
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [liking, setLiking] = useState(false);
    const [coined, setCoined] = useState(false);
    const [coinCount, setCoinCount] = useState(0);
    const [coining, setCoining] = useState(false);
    const [favorited, setFavorited] = useState(false);
    const [favCount, setFavCount] = useState(0);
    const [favoriting, setFavoriting] = useState(false);
    const [tip, setTip] = useState("");
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        setArticle(null);
        if (!Number.isFinite(cvid) || cvid <= 0) {
            setError("专栏 ID 无效");
            setLoading(false);
            return;
        }
        if (typeof window.biliDesk.bili.getArticle !== "function") {
            setError("专栏服务未就绪，请完全重启应用后再试");
            setLoading(false);
            return;
        }
        void window.biliDesk.bili
            .getArticle(cvid)
            .then((detail) => {
            if (cancelled)
                return;
            if (!detail.content?.trim() && detail.dynId) {
                navigate(`/dynamic/${detail.dynId}`, { replace: true });
                return;
            }
            setArticle(detail);
            setLiked(Boolean(detail.liked));
            setLikeCount(detail.like);
            setCoined(Boolean(detail.coined));
            setCoinCount(detail.coin);
            setFavorited(Boolean(detail.favorited));
            setFavCount(detail.favorite);
        })
            .catch((err) => {
            if (cancelled)
                return;
            setError(formatDisplayedError(err, undefined, "加载专栏失败"));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [cvid, navigate]);
    const html = useMemo(() => (article?.content ? sanitizeArticleHtml(article.content) : ""), [article?.content]);
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip(""), 1800);
    };
    const handleLike = async () => {
        if (!article || liking)
            return;
        const next = !liked;
        setLiking(true);
        try {
            await window.biliDesk.bili.likeArticle(article.id, next);
            setLiked(next);
            setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "点赞失败"));
        }
        finally {
            setLiking(false);
        }
    };
    const handleCoin = async () => {
        if (!article || coining || coined)
            return;
        setCoining(true);
        try {
            await window.biliDesk.bili.coinArticle(article.id, article.mid, 1);
            setCoined(true);
            setCoinCount((prev) => prev + 1);
            showTip("已投币");
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "投币失败"));
        }
        finally {
            setCoining(false);
        }
    };
    const handleFavorite = async () => {
        if (!article || favoriting)
            return;
        const next = !favorited;
        setFavoriting(true);
        try {
            await window.biliDesk.bili.favoriteArticle(article.id, next);
            setFavorited(next);
            setFavCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "收藏失败"));
        }
        finally {
            setFavoriting(false);
        }
    };
    const handleShare = async () => {
        if (!article)
            return;
        try {
            await navigator.clipboard.writeText(`https://www.bilibili.com/read/cv${article.id}`);
            showTip("链接已复制");
        }
        catch {
            showTip("复制失败");
        }
    };
    const handleContentClick = async (event) => {
        const target = event.target;
        const anchor = target?.closest("a");
        if (!anchor)
            return;
        const href = anchor.getAttribute("href");
        if (!href)
            return;
        event.preventDefault();
        event.stopPropagation();
        await openBiliHref(href, navigate);
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/", label: "\u8FD4\u56DE" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: loading ? (_jsxs("div", { className: "flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E13\u680F\u4E2D..."] })) : error ? (_jsx(ErrorState, { error: error, hint: "article", fallback: "\u4E13\u680F\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", className: "min-h-[50vh]" })) : !article ? (_jsx("p", { className: "px-6 py-16 text-center text-sm text-muted-foreground", children: "\u4E13\u680F\u4E0D\u5B58\u5728" })) : (_jsxs("div", { className: "mx-auto flex max-w-3xl gap-6 px-6 py-6", children: [_jsxs("div", { className: "min-w-0 flex-1 space-y-5", children: [article.banner && (_jsx(BiliImage, { src: article.banner, alt: "", className: "max-h-[360px] w-full rounded-xl object-cover" })), _jsx("h1", { className: "text-2xl font-semibold leading-snug", children: article.title }), _jsxs("div", { className: "flex items-center gap-3", children: [article.authorFace ? (_jsx(BiliImage, { src: article.authorFace, alt: article.author, className: "h-11 w-11 rounded-full object-cover" })) : (_jsx("div", { className: "h-11 w-11 rounded-full bg-secondary" })), _jsxs("div", { className: "min-w-0", children: [article.mid ? (_jsx(Link, { to: `/up/${article.mid}`, className: "truncate text-[15px] font-medium text-sky-400 hover:underline", children: article.author || "用户" })) : (_jsx("p", { className: "truncate text-[15px] font-medium", children: article.author || "用户" })), _jsxs("p", { className: "text-xs text-muted-foreground", children: [formatPubTime(article.pubTime), article.categoryName ? ` · ${article.categoryName}` : "", article.words > 0
                                                            ? ` · ${article.words.toLocaleString()} 字`
                                                            : "", article.view > 0
                                                            ? ` · ${formatCount(article.view)} 阅读`
                                                            : ""] })] })] }), html ? (_jsx("div", { className: "article-body", onClick: (event) => void handleContentClick(event), dangerouslySetInnerHTML: { __html: html } })) : (_jsx("p", { className: "whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground", children: article.summary || "这篇专栏没有正文内容" })), _jsx("div", { className: "border-t border-border pt-5", children: _jsx(DynamicCommentSection, { oid: String(article.id), type: ARTICLE_COMMENT_TYPE, replyCount: article.reply, ownerMid: article.mid, focusRpid: focusRpid, focusRoot: focusRoot }) })] }), _jsxs("aside", { className: "sticky top-4 hidden h-fit w-14 shrink-0 flex-col items-center gap-4 self-start rounded-full border border-border/70 bg-card/90 px-2 py-4 shadow-sm lg:flex", children: [tip && (_jsx("span", { className: "absolute -left-24 top-2 rounded-full bg-black/80 px-2 py-1 text-[11px] text-white", children: tip })), _jsxs("button", { type: "button", onClick: () => void handleLike(), disabled: liking, className: cn("flex flex-col items-center gap-1 text-xs transition-colors", liked
                                        ? "text-pink-400"
                                        : "text-muted-foreground hover:text-foreground"), children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(ThumbsUp, { className: cn("h-4 w-4", liked && "fill-current") }) }), formatCount(likeCount)] }), _jsxs("button", { type: "button", onClick: () => void handleCoin(), disabled: coining || coined, className: cn("flex flex-col items-center gap-1 text-xs transition-colors", coined
                                        ? "text-amber-400"
                                        : "text-muted-foreground hover:text-foreground"), children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(Coins, { className: "h-4 w-4" }) }), formatCount(coinCount)] }), _jsxs("button", { type: "button", onClick: () => void handleFavorite(), disabled: favoriting, className: cn("flex flex-col items-center gap-1 text-xs transition-colors", favorited
                                        ? "text-amber-400"
                                        : "text-muted-foreground hover:text-foreground"), children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(Star, { className: cn("h-4 w-4", favorited && "fill-current") }) }), formatCount(favCount)] }), _jsxs("button", { type: "button", onClick: () => void handleShare(), className: "flex flex-col items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(Share2, { className: "h-4 w-4" }) }), formatCount(article.share)] }), _jsxs("div", { className: "flex flex-col items-center gap-1 text-xs text-muted-foreground", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(MessageCircle, { className: "h-4 w-4" }) }), formatCount(article.reply)] })] })] })) })] }));
}
