import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastContextValue {
  notify: (
    message: string,
    type?: ToastType,
    options?: { duration?: number },
  ) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const notify = useCallback(
    (
      message: string,
      type: ToastType = "success",
      options?: { duration?: number },
    ) => {
      const id = ++nextId.current;
      const duration =
        options?.duration !== undefined ? options.duration : 3600;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      if (duration > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    [],
  );

  const showSuccess = useCallback(
    (message: string) => notify(message, "success"),
    [notify],
  );
  const showError = useCallback(
    (message: string) => notify(message, "error"),
    [notify],
  );
  const showInfo = useCallback(
    (message: string) => notify(message, "info"),
    [notify],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ notify, showSuccess, showError, showInfo }}>
      {children}
      <div
        className="toast-region fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none p-4"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const iconMap = {
    success: (
      <CheckCircle2
        className="h-4 w-4 text-emerald-400 shrink-0"
        aria-hidden="true"
      />
    ),
    error: (
      <AlertCircle
        className="h-4 w-4 text-red-400 shrink-0"
        aria-hidden="true"
      />
    ),
    warning: (
      <AlertTriangle
        className="h-4 w-4 text-amber-400 shrink-0"
        aria-hidden="true"
      />
    ),
    info: <Info className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />,
  };

  const isAlert = toast.type === "error" || toast.type === "warning";

  return (
    <div
      role={isAlert ? "alert" : "status"}
      className={cn(
        "toast pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3.5 text-sm text-card-foreground shadow-lg backdrop-blur-md transition-all duration-200 transform",
        `toast--${toast.type}`,
        visible
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-2 opacity-0 scale-95",
        toast.type === "error" &&
          "border-red-500/30 bg-red-950/40 text-red-100",
        toast.type === "success" &&
          "border-emerald-500/30 bg-emerald-950/40 text-emerald-100",
        toast.type === "warning" &&
          "border-amber-500/30 bg-amber-950/40 text-amber-100",
        toast.type === "info" && "border-sky-500/30 bg-sky-950/40 text-sky-100",
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {iconMap[toast.type]}
        <span className="font-medium break-words leading-tight">
          {toast.message}
        </span>
      </div>
      <button
        type="button"
        aria-label="关闭提示"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: { id?: number; message: string; type?: ToastType; tone?: string };
  onDismiss?: () => void;
}) {
  const type = (
    toast.type || toast.tone === "error"
      ? "error"
      : toast.tone === "warning"
        ? "warning"
        : toast.tone === "success"
          ? "success"
          : "info"
  ) as ToastType;
  return (
    <ToastItem
      toast={{
        id: toast.id || 0,
        message: toast.message,
        type,
      }}
      onClose={onDismiss || (() => {})}
    />
  );
}

export async function copyText(
  value: string,
  notify: ToastContextValue["notify"] | ((msg: string, type?: any) => void),
  successMessage = "已复制到剪贴板。",
) {
  try {
    await navigator.clipboard.writeText(value);
    notify(successMessage, "success");
    return true;
  } catch {
    notify("复制失败，请检查浏览器剪贴板权限。", "error");
    return false;
  }
}
