import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Alert, IconButton } from "@gouno/ui/core";

export type AppFeedbackType = "error" | "success" | "warning" | "info";
export type AppFeedbackOptions = { duration?: number };

export interface AppFeedbackApi {
  notify: (
    message: string,
    type?: AppFeedbackType,
    options?: AppFeedbackOptions,
  ) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

type FeedbackItem = {
  id: number;
  message: string;
  type: AppFeedbackType;
};

const AppFeedbackContext = createContext<AppFeedbackApi | null>(null);

function RootAppFeedbackProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const nextID = useRef(1);
  const timers = useRef(
    new Map<number, ReturnType<typeof window.setTimeout>>(),
  );

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (
      message: string,
      type: AppFeedbackType = "success",
      options?: AppFeedbackOptions,
    ) => {
      const id = nextID.current++;
      setItems((current) => [...current, { id, message, type }]);
      if (options?.duration !== 0) {
        const timer = window.setTimeout(
          () => dismiss(id),
          options?.duration ?? 4000,
        );
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const api = useMemo<AppFeedbackApi>(
    () => ({
      notify,
      showSuccess: (message) => notify(message, "success"),
      showError: (message) => notify(message, "error"),
      showInfo: (message) => notify(message, "info"),
    }),
    [notify],
  );

  return (
    <AppFeedbackContext.Provider value={api}>
      {children}
      <div
        aria-label="应用提示"
        className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
      >
        {items.map((item) => (
          <Alert
            key={item.id}
            type={item.type}
            showIcon
            role={
              item.type === "error" || item.type === "warning"
                ? "alert"
                : "status"
            }
            className="shadow-lg"
            action={
              <IconButton
                variant="ghost"
                size="small"
                label="关闭提示"
                icon={<X />}
                onClick={() => dismiss(item.id)}
              />
            }
          >
            {item.message}
          </Alert>
        ))}
      </div>
    </AppFeedbackContext.Provider>
  );
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const parent = useContext(AppFeedbackContext);
  if (parent) return <>{children}</>;
  return <RootAppFeedbackProvider>{children}</RootAppFeedbackProvider>;
}

export function useAppFeedback(): AppFeedbackApi {
  const value = useContext(AppFeedbackContext);
  if (!value) {
    throw new Error(
      "useAppFeedback must be used within an AppFeedbackProvider",
    );
  }
  return value;
}
