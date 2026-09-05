import {
  useEffect,
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  LoaderCircle,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Alert } from "./components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "./components/ui/empty";
import { Skeleton as PrimitiveSkeleton } from "./components/ui/skeleton";
import { Button } from "./actions";
import { AdminPage, PageHeader } from "./layout";
import { useTheme } from "./theme";
import { cn } from "./lib/utils";
export type FeedbackType = "error" | "success" | "warning" | "info";
export type Tone = FeedbackType | "danger" | "neutral" | "brand";
const tones: Record<Tone, string> = {
  error: "border-destructive/40 bg-danger-subtle text-destructive",
  danger: "border-destructive/40 bg-danger-subtle text-destructive",
  success: "border-success/40 bg-success-subtle text-success",
  warning: "border-warning/40 bg-warning-subtle text-warning",
  info: "border-info/40 bg-info-subtle text-info",
  neutral: "border-border bg-muted text-muted-foreground",
  brand: "border-primary/40 bg-accent text-accent-foreground",
};
export function Feedback({
  type,
  children,
  className,
}: {
  type: FeedbackType;
  children: ReactNode;
  className?: string;
}) {
  const Icon =
    type === "success" ? CheckCircle2 : type === "info" ? Info : AlertTriangle;
  return (
    <Alert
      role={type === "error" ? "alert" : "status"}
      className={cn(
        `feedback-${type}`,
        "flex items-start gap-3 text-sm",
        tones[type],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </Alert>
  );
}
export function Banner({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Alert
      role="status"
      className={cn("flex items-start gap-3", tones[tone], className)}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </Alert>
  );
}
export function NoticeCard({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Banner tone={tone} className={className}>
      <div className="flex flex-col gap-2">
        {title ? <strong>{title}</strong> : null}
        {children}
        {action}
      </div>
    </Banner>
  );
}
interface StateProps {
  title?: ReactNode;
  label?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}
export function EmptyState({
  title,
  label,
  description,
  action,
  icon,
  className,
}: StateProps) {
  return (
    <Empty className={cn("border-0 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon || <Inbox />}</EmptyMedia>
        <EmptyTitle>{label || title || "暂无数据"}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
export function ErrorState(props: StateProps) {
  return (
    <div role="alert">
      <EmptyState
        {...props}
        title={props.title || "加载失败"}
        icon={<AlertTriangle className="text-destructive" />}
      />
    </div>
  );
}
export function LoadingSpinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
      style={{
        width: size === "sm" ? 20 : size === "lg" ? 48 : 32,
        height: size === "sm" ? 20 : size === "lg" ? 48 : 32,
      }}
    />
  );
}
export function LoadingState({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground",
        className,
      )}
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      {label ||
        (typeof document !== "undefined" &&
        document.documentElement.lang.startsWith("en")
          ? "Loading…"
          : "正在加载…")}
    </div>
  );
}
export const PageLoader = ({ message }: { message?: string }) => (
  <LoadingState label={message} />
);
export function AdminPageState({
  title,
  description,
  label,
}: {
  title: string;
  description?: ReactNode;
  label: string;
}) {
  return (
    <AdminPage>
      <PageHeader title={title} description={description} />
      <LoadingState label={label} />
    </AdminPage>
  );
}
export interface AsyncStateProps {
  loading: boolean;
  loadingLabel?: string;
  loadingMessage?: string;
  skeleton?: ReactNode;
  error?: string | null;
  empty?: boolean;
  emptyState?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  children: ReactNode;
}
export function AsyncState({
  loading,
  loadingLabel,
  loadingMessage,
  skeleton,
  error,
  empty,
  emptyState,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon,
  onRetry,
  retryLabel,
  children,
}: AsyncStateProps) {
  if (loading)
    return (
      <>{skeleton || <LoadingState label={loadingLabel || loadingMessage} />}</>
    );
  if (error)
    return (
      <ErrorState
        title={error}
        action={
          onRetry ? (
            <Button
              onClick={onRetry}
              aria-label={
                retryLabel ||
                (error && /[\u4e00-\u9fff]/.test(error) ? "重试" : "Retry")
              }
            >
              {retryLabel ||
                (typeof document !== "undefined" &&
                document.documentElement.lang.startsWith("en")
                  ? "Retry"
                  : "重试")}
            </Button>
          ) : null
        }
      />
    );
  if (empty)
    return (
      <>
        {emptyState || (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            icon={emptyIcon}
          />
        )}
      </>
    );
  return <>{children}</>;
}
export function Skeleton({
  variant = "text",
  width,
  height,
  style,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: number | string;
}) {
  return (
    <PrimitiveSkeleton
      {...props}
      aria-hidden="true"
      className={cn(
        `skeleton--${variant}`,
        variant === "rectangular" && "skeleton-rectangular",
        variant === "circular"
          ? "rounded-full"
          : variant === "card"
            ? "h-32"
            : "h-4",
        className,
      )}
      style={{ ...style, width, height }}
    />
  );
}
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
  label,
}: {
  rows?: number;
  columns?: number;
  className?: string;
  label?: string;
}) {
  const localizedLabel =
    label ||
    (typeof document !== "undefined" &&
    document.documentElement.lang.startsWith("zh")
      ? "正在载入数据…"
      : "Loading table data");
  const rowsMarkup = Array.from({ length: rows }, (_, r) => (
    <div className="table-skeleton-row flex gap-4" key={r}>
      {Array.from({ length: columns }, (_, c) => (
        <Skeleton key={c} className="flex-1" />
      ))}
    </div>
  ));
  return (
    <>
      <div
        role="status"
        aria-label={localizedLabel}
        className={cn("flex flex-col gap-4 py-4", className)}
      >
        {rowsMarkup}
      </div>
      {!label ? (
        <div
          role="status"
          aria-label={
            localizedLabel === "Loading table data"
              ? "正在载入数据…"
              : "Loading table data"
          }
          className="sr-only"
        />
      ) : null}
    </>
  );
}
export function ArticleListSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="正在载入文章列表…"
      className={cn("flex flex-col gap-8", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 border-b pb-6">
          <Skeleton width="70%" height={24} />
          <Skeleton />
          <Skeleton width="40%" />
        </div>
      ))}
    </div>
  );
}
function notifyToast(
  message: string,
  type: FeedbackType = "success",
  options?: { duration?: number },
) {
  const id = toast.custom(
    () => (
      <div
        role={type === "warning" || type === "error" ? "alert" : "status"}
        className={cn(
          `toast--${type}`,
          "flex min-w-72 items-center gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg",
          tones[type],
        )}
      >
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          aria-label="关闭提示"
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          onClick={() => toast.dismiss(id)}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    ),
    { duration: options?.duration === 0 ? Infinity : options?.duration },
  );
  return id;
}
type ToastItem = { id: number; message: string; type: FeedbackType };
type ToastApi = {
  notify: (
    message: string,
    type?: FeedbackType,
    options?: { duration?: number },
  ) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};
const ToastContext = createContext<ToastApi | null>(null);
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within a ToastProvider");
  return value;
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const parent = useContext(ToastContext);
  const { resolvedMode } = useTheme();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const notify = useCallback(
    (
      message: string,
      type: FeedbackType = "success",
      options?: { duration?: number },
    ) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, message, type }]);
      if (options?.duration !== 0) {
        window.setTimeout(
          () => setItems((current) => current.filter((item) => item.id !== id)),
          options?.duration ?? 4000,
        );
      }
    },
    [],
  );
  const api: ToastApi = {
    notify,
    showSuccess: (message) => notify(message, "success"),
    showError: (message) => notify(message, "error"),
    showInfo: (message) => notify(message, "info"),
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      {!parent ? (
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-3"
          data-theme={resolvedMode}
        >
          {items.map((item) => (
            <div
              key={item.id}
              role={
                item.type === "warning" || item.type === "error"
                  ? "alert"
                  : "status"
              }
              className={cn(
                `toast--${item.type}`,
                "flex min-w-72 items-center gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg",
                tones[item.type],
              )}
            >
              <span className="min-w-0 flex-1">{item.message}</span>
              <button
                type="button"
                aria-label="关闭提示"
                onClick={() =>
                  setItems((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )
                }
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function Toast({
  toast: message,
  onDismiss,
}: {
  toast: { id?: number; message: string; type?: FeedbackType; tone?: string };
  onDismiss?: () => void;
}) {
  useEffect(() => {
    const kind =
      message.type ||
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
export async function copyText(
  value: string,
  notify: ToastApi["notify"],
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
