import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { IconButton } from "./Button";

export type ToastTone = "success" | "error" | "info" | "warning";

export type ToastOptions = {
  duration?: number;
};

export type ToastMessage = ToastOptions & {
  id: number;
  message: string;
  tone: ToastTone;
};

export interface ToastContextValue {
  notify: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastIcons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 aria-hidden="true" />,
  error: <AlertTriangle aria-hidden="true" />,
  info: <Info aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
};

import { TIMEOUTS_MS } from "../../constants";

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (toast.duration === 0) return;
    const timeout = window.setTimeout(
      () => onDismiss(toast.id),
      toast.duration ?? TIMEOUTS_MS.TOAST_DEFAULT,
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div
      className={`toast toast--${toast.tone}`}
      role={
        toast.tone === "error" || toast.tone === "warning" ? "alert" : "status"
      }
    >
      {toastIcons[toast.tone]}
      <span>{toast.message}</span>
      <IconButton
        label="关闭提示"
        icon={<X />}
        size="compact"
        variant="ghost"
        onClick={() => onDismiss(toast.id)}
      />
    </div>
  );
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextID = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback<ToastContextValue["notify"]>(
    (message, tone = "success", options = {}) => {
      const id = ++nextID.current;
      setToasts((current) => {
        if (
          current.some(
            (toast) => toast.message === message && toast.tone === tone,
          )
        ) {
          return current;
        }
        return [...current, { id, message, tone, ...options }];
      });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
