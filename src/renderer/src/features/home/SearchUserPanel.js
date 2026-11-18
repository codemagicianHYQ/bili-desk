import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { SearchUserCard } from "@/components/search/SearchUserCard";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFollowedMidSet } from "@/lib/use-followed-mids";
import { Loader2 } from "lucide-react";
const USER_PAGE_SIZE = 20;
const ORDER_OPTIONS = [
    { value: "default", label: "按关联度" },
    { value: "fans_desc", label: "粉丝数由高到低" },
    { value: "fans_asc", label: "粉丝数由低到高" },
    { value: "level_desc", label: "Lv等级由高到低" },
    { value: "level_asc", label: "Lv等级由低到高" },
];
const USER_TYPE_OPTIONS = [
    { value: 0, label: "全部用户" },
    { value: 1, label: "UP主用户" },
    { value: 2, label: "普通用户" },
    { value: 3, label: "认证用户" },
];
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function SearchUserPanel({ keyword, active }) {
    const followedMidSet = useFollowedMidSet();
    const loadSeqRef = useRef(0);
    const [order, setOrder] = useState("default");
    const [userType, setUserType] = useState(0);
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (nextKeyword, nextPage, nextOrder, nextType) => {
        const trimmed = nextKeyword.trim();
        if (!trimmed)
            return;
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setError("");
        try {
            const result = await window.biliDesk.bili.searchUsers(trimmed, nextPage, nextOrder, nextType);
            if (seq !== loadSeqRef.current)
                return;
            setUsers(result.users);
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setUsers([]);
            setError(formatError(err));
        }
        finally {
            if (seq === loadSeqRef.current)
                setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (!active || !keyword.trim())
            return;
        void load(keyword, 1, order, userType);
    }, [active, keyword, order, userType, load]);
    const totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
    const goToPage = (nextPage) => {
        if (loading || nextPage < 1)
            return;
        if (nextPage > totalPages && !hasMore)
            return;
        void load(keyword, nextPage, order, userType);
    };
    if (!active)
        return null;
    return (_jsxs("div", { children: [_jsxs("div", { className: "space-y-2 border-b border-border px-6 py-3", children: [_jsx("div", { className: "flex flex-wrap gap-2", children: ORDER_OPTIONS.map((option) => (_jsx("button", { type: "button", onClick: () => setOrder(option.value), className: cn("rounded-md px-2.5 py-1 text-xs transition-colors", order === option.value
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: option.label }, option.value))) }), _jsx("div", { className: "flex flex-wrap gap-2", children: USER_TYPE_OPTIONS.map((option) => (_jsx("button", { type: "button", onClick: () => setUserType(option.value), className: cn("rounded-md px-2.5 py-1 text-xs transition-colors", userType === option.value
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: option.label }, option.value))) })] }), loading && users.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u641C\u7D22\u7528\u6237\u4E2D..."] })) : error && users.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void load(keyword, page, order, userType), children: "\u91CD\u8BD5" })] })) : users.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u7528\u6237" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("mx-auto grid max-w-5xl gap-x-8 gap-y-1 px-6 py-4 md:grid-cols-2", loading && "opacity-60"), children: users.map((user) => (_jsx(SearchUserCard, { user: user, followed: followedMidSet.has(user.mid) }, user.mid))) }), _jsx(PaginationBar, { page: page, totalPages: totalPages, disabled: loading, disableNext: !hasMore && page >= totalPages, onPageChange: goToPage, info: _jsxs(_Fragment, { children: ["\u7EA6 ", total.toLocaleString(), " \u4F4D\u7528\u6237 \u00B7 \u7B2C ", page, " / ", totalPages, " \u9875"] }) })] }))] }));
}
