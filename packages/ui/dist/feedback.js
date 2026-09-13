import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, createContext, useContext, useCallback, useRef, useState, } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, LoaderCircle, X, } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Alert } from "./components/ui/alert.js";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent, } from "./components/ui/empty.js";
import { Skeleton as PrimitiveSkeleton } from "./components/ui/skeleton.js";
import { Button } from "./actions.js";
import { AdminPage, PageHeader } from "./layout.js";
import { useTheme } from "./theme.js";
import { cn } from "./lib/utils.js";
const tones = {
    error: "border-destructive/40 bg-danger-subtle text-destructive",
    danger: "border-destructive/40 bg-danger-subtle text-destructive",
    success: "border-success/40 bg-success-subtle text-success",
    warning: "border-warning/40 bg-warning-subtle text-warning",
    info: "border-info/40 bg-info-subtle text-info",
    neutral: "border-border bg-muted text-muted-foreground",
    brand: "border-primary/40 bg-accent text-accent-foreground",
};
export function Feedback({ type, children, className, }) {
    const Icon = type === "success" ? CheckCircle2 : type === "info" ? Info : AlertTriangle;
    return (_jsxs(Alert, { role: type === "error" ? "alert" : "status", className: cn(`feedback-${type}`, "feedback flex items-center gap-3 text-sm", tones[type], className), children: [_jsx(Icon, { "aria-hidden": "true", className: "size-4 shrink-0" }), _jsx("div", { className: "min-w-0 flex-1", children: children })] }));
}
export function Banner({ tone = "info", icon, children, className, }) {
    return (_jsxs(Alert, { role: "status", className: cn("flex items-start gap-3", tones[tone], className), children: [icon, _jsx("div", { className: "min-w-0", children: children })] }));
}
export function NoticeCard({ tone = "info", title, children, action, className, }) {
    return (_jsx(Banner, { tone: tone, className: className, children: _jsxs("div", { className: "flex flex-col gap-2", children: [title ? _jsx("strong", { children: title }) : null, children, action] }) }));
}
export function EmptyState({ title, label, description, action, icon, className, }) {
    return (_jsxs(Empty, { className: cn("border-0 py-12", className), children: [_jsxs(EmptyHeader, { children: [_jsx(EmptyMedia, { variant: "icon", children: icon || _jsx(Inbox, {}) }), _jsx(EmptyTitle, { children: label || title || "暂无数据" }), description ? (_jsx(EmptyDescription, { children: description })) : null] }), action ? _jsx(EmptyContent, { children: action }) : null] }));
}
export function ErrorState(props) {
    return (_jsx("div", { role: "alert", children: _jsx(EmptyState, { ...props, title: props.title || "加载失败", icon: _jsx(AlertTriangle, { className: "text-destructive" }) }) }));
}
export function LoadingSpinner({ size = "md", className, }) {
    return (_jsx(LoaderCircle, { role: "status", "aria-label": "Loading", className: cn("animate-spin", className), style: {
            width: size === "sm" ? 20 : size === "lg" ? 48 : 32,
            height: size === "sm" ? 20 : size === "lg" ? 48 : 32,
        } }));
}
export function LoadingState({ label, className, }) {
    return (_jsxs("div", { role: "status", className: cn("flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground", className), children: [_jsx(LoaderCircle, { "aria-hidden": "true", className: "size-5 animate-spin" }), label ||
                (typeof document !== "undefined" &&
                    document.documentElement.lang.startsWith("en")
                    ? "Loading…"
                    : "正在加载…")] }));
}
export const PageLoader = ({ message }) => (_jsx(LoadingState, { label: message }));
export function AdminPageState({ title, description, label, }) {
    return (_jsxs(AdminPage, { children: [_jsx(PageHeader, { title: title, description: description }), _jsx(LoadingState, { label: label })] }));
}
export function AsyncState({ loading, loadingLabel, loadingMessage, skeleton, error, empty, emptyState, emptyTitle, emptyDescription, emptyAction, emptyIcon, onRetry, retryLabel, children, }) {
    if (loading)
        return (_jsx(_Fragment, { children: skeleton || _jsx(LoadingState, { label: loadingLabel || loadingMessage }) }));
    if (error)
        return (_jsx(ErrorState, { title: error, action: onRetry ? (_jsx(Button, { onClick: onRetry, "aria-label": retryLabel ||
                    (error && /[\u4e00-\u9fff]/.test(error) ? "重试" : "Retry"), children: retryLabel ||
                    (typeof document !== "undefined" &&
                        document.documentElement.lang.startsWith("en")
                        ? "Retry"
                        : "重试") })) : null }));
    if (empty)
        return (_jsx(_Fragment, { children: emptyState || (_jsx(EmptyState, { title: emptyTitle, description: emptyDescription, action: emptyAction, icon: emptyIcon })) }));
    return _jsx(_Fragment, { children: children });
}
export function Skeleton({ variant = "text", width, height, style, className, ...props }) {
    return (_jsx(PrimitiveSkeleton, { ...props, "aria-hidden": "true", className: cn(`skeleton--${variant}`, variant === "rectangular" && "skeleton-rectangular", variant === "circular"
            ? "rounded-full"
            : variant === "card"
                ? "h-32"
                : "h-4", className), style: { ...style, width, height } }));
}
export function TableSkeleton({ rows = 5, columns = 4, className, label, }) {
    const localizedLabel = label ||
        (typeof document !== "undefined" &&
            document.documentElement.lang.startsWith("zh")
            ? "正在载入数据…"
            : "Loading table data");
    const rowsMarkup = Array.from({ length: rows }, (_, r) => (_jsx("div", { className: "table-skeleton-row flex gap-4", children: Array.from({ length: columns }, (_, c) => (_jsx(Skeleton, { className: "flex-1" }, c))) }, r)));
    return (_jsxs(_Fragment, { children: [_jsx("div", { role: "status", "aria-label": localizedLabel, className: cn("flex flex-col gap-4 py-4", className), children: rowsMarkup }), !label ? (_jsx("div", { role: "status", "aria-label": localizedLabel === "Loading table data"
                    ? "正在载入数据…"
                    : "Loading table data", className: "sr-only" })) : null] }));
}
export function ArticleListSkeleton({ count = 4, className, }) {
    return (_jsx("div", { role: "status", "aria-label": "\u6B63\u5728\u8F7D\u5165\u6587\u7AE0\u5217\u8868\u2026", className: cn("flex flex-col gap-8", className), children: Array.from({ length: count }, (_, i) => (_jsxs("div", { className: "flex flex-col gap-3 border-b pb-6", children: [_jsx(Skeleton, { width: "70%", height: 24 }), _jsx(Skeleton, {}), _jsx(Skeleton, { width: "40%" })] }, i))) }));
}
function notifyToast(message, type = "success", options) {
    const id = toast.custom(() => (_jsxs("div", { role: type === "warning" || type === "error" ? "alert" : "status", className: cn(`toast--${type}`, "flex min-w-72 items-center gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg", tones[type]), children: [_jsx("span", { className: "min-w-0 flex-1", children: message }), _jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", className: "rounded-sm p-1 text-muted-foreground hover:text-foreground", onClick: () => toast.dismiss(id), children: _jsx(X, { "aria-hidden": "true", className: "size-4" }) })] })), { duration: options?.duration === 0 ? Infinity : options?.duration });
    return id;
}
const ToastContext = createContext(null);
export function useToast() {
    const value = useContext(ToastContext);
    if (!value)
        throw new Error("useToast must be used within a ToastProvider");
    return value;
}
export function ToastProvider({ children }) {
    const parent = useContext(ToastContext);
    const { resolvedMode } = useTheme();
    const [items, setItems] = useState([]);
    const nextId = useRef(1);
    const notify = useCallback((message, type = "success", options) => {
        const id = nextId.current++;
        setItems((current) => [...current, { id, message, type }]);
        if (options?.duration !== 0) {
            window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), options?.duration ?? 4000);
        }
    }, []);
    const api = {
        notify,
        showSuccess: (message) => notify(message, "success"),
        showError: (message) => notify(message, "error"),
        showInfo: (message) => notify(message, "info"),
    };
    return (_jsxs(ToastContext.Provider, { value: api, children: [children, !parent ? (_jsx("div", { className: "fixed bottom-4 right-4 z-50 flex flex-col gap-3", "data-theme": resolvedMode, children: items.map((item) => (_jsxs("div", { role: item.type === "warning" || item.type === "error"
                        ? "alert"
                        : "status", className: cn(`toast--${item.type}`, "flex min-w-72 items-center gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg", tones[item.type]), children: [_jsx("span", { className: "min-w-0 flex-1", children: item.message }), _jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => setItems((current) => current.filter((entry) => entry.id !== item.id)), children: _jsx(X, { "aria-hidden": "true", className: "size-4" }) })] }, item.id))) })) : null] }));
}
export function Toast({ toast: message, onDismiss, }) {
    useEffect(() => {
        const kind = message.type ||
            (message.tone === "error"
                ? "error"
                : message.tone === "warning"
                    ? "warning"
                    : message.tone === "success"
                        ? "success"
                        : "info");
        const id = toast[kind](message.message, {
            onDismiss: () => onDismiss?.(),
            onAutoClose: () => onDismiss?.(),
        });
        return () => {
            toast.dismiss(id);
        };
    }, [message.message, message.type, message.tone, onDismiss]);
    return null;
}
export async function copyText(value, notify, successMessage = "已复制到剪贴板。") {
    try {
        await navigator.clipboard.writeText(value);
        notify(successMessage, "success");
        return true;
    }
    catch {
        notify("复制失败，请检查浏览器剪贴板权限。", "error");
        return false;
    }
}
