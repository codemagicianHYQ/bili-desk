import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
function formatLoginError(err) {
    return formatDisplayedError(err, undefined, "登录失败，请重试");
}
export function LoginPage() {
    const navigate = useNavigate();
    const { user, setUser, loadUser } = useAppStore();
    const [checking, setChecking] = useState(true);
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [status, setStatus] = useState("正在生成二维码...");
    const [error, setError] = useState("");
    const pollRef = useRef(null);
    const stopPoll = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);
    const startLogin = useCallback(async () => {
        stopPoll();
        setError("");
        setQrDataUrl("");
        setStatus("正在生成二维码...");
        try {
            const { url, qrcodeKey } = await window.biliDesk.auth.getQrCode();
            const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
            setQrDataUrl(dataUrl);
            setStatus("请使用 B 站 App 扫码");
            pollRef.current = setInterval(async () => {
                try {
                    const result = await window.biliDesk.auth.pollLogin(qrcodeKey);
                    if (result.status === "waiting")
                        setStatus("请使用 B 站 App 扫码");
                    if (result.status === "scanned")
                        setStatus("已扫码，请在手机上确认");
                    if (result.status === "expired") {
                        stopPoll();
                        setStatus("二维码已过期，正在刷新...");
                        void startLogin();
                    }
                    if (result.status === "confirmed" && result.user) {
                        setStatus("登录成功");
                        setUser(result.user);
                        stopPoll();
                        setTimeout(() => navigate("/"), 800);
                    }
                    if (result.status === "failed") {
                        stopPoll();
                        setError(result.message ?? "登录失败，请重试");
                    }
                }
                catch (pollErr) {
                    const message = formatLoginError(pollErr);
                    if (message.includes("过期") || message.includes("86038")) {
                        stopPoll();
                        setStatus("二维码已过期，正在刷新...");
                        void startLogin();
                        return;
                    }
                    stopPoll();
                    setError(message);
                }
            }, 2000);
        }
        catch (err) {
            setError(formatLoginError(err));
            setStatus("请重试");
        }
    }, [navigate, setUser, stopPoll]);
    useEffect(() => {
        void (async () => {
            await loadUser();
            const current = await window.biliDesk.auth.getStatus();
            if (current.isLogin) {
                setUser(current);
                navigate("/", { replace: true });
                return;
            }
            setChecking(false);
            void startLogin();
        })();
        return stopPoll;
    }, [loadUser, navigate, setUser, startLogin, stopPoll]);
    if (checking || user?.isLogin) {
        return (_jsx("div", { className: "flex h-full items-center justify-center bg-background text-sm text-muted-foreground", children: "\u68C0\u67E5\u767B\u5F55\u72B6\u6001..." }));
    }
    return (_jsx("div", { className: "flex h-full items-center justify-center overflow-y-auto bg-background p-6", children: _jsxs("div", { className: "w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 text-center shadow-xl", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-semibold", children: ["\u767B\u5F55 ", _jsx("span", { className: "text-primary", children: "BiliLoft" })] }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "\u626B\u7801\u767B\u5F55\u4F60\u7684 B \u7AD9\u8D26\u53F7" })] }), _jsx("div", { className: "mx-auto flex h-52 w-52 items-center justify-center rounded-xl bg-white p-3", children: qrDataUrl ? (_jsx("img", { src: qrDataUrl, alt: "\u767B\u5F55\u4E8C\u7EF4\u7801", className: "h-full w-full" })) : (_jsx("div", { className: "text-sm text-gray-400", children: error ? "生成失败" : "加载中..." })) }), _jsx("p", { className: "text-sm text-muted-foreground", children: status }), error && _jsx("p", { className: "text-sm text-red-500", children: error }), _jsxs("div", { className: "flex justify-center gap-2", children: [_jsx(Button, { variant: "outline", onClick: () => navigate("/"), children: "\u8FD4\u56DE\u9996\u9875" }), error && (_jsx(Button, { variant: "secondary", onClick: () => void startLogin(), children: "\u91CD\u65B0\u751F\u6210" }))] })] }) }));
}
