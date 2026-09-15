import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { NotificationProvider, useNotification } from "@gouno/ui/core";

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

const AppFeedbackContext = createContext<AppFeedbackApi | null>(null);
const notificationClosable = { "aria-label": "关闭提示" } as const;

function AppFeedbackBridge({ children }: { children: ReactNode }) {
  const { open } = useNotification();

  const notify = useCallback(
    (
      message: string,
      type: AppFeedbackType = "success",
      options?: AppFeedbackOptions,
    ) => {
      if (options?.duration === 0) {
        open({
          title: message,
          type,
          persistent: true,
          closable: notificationClosable,
        });
        return;
      }

      open({
        title: message,
        type,
        duration: options?.duration ?? 4000,
        closable: notificationClosable,
      });
    },
    [open],
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
    </AppFeedbackContext.Provider>
  );
}

function RootAppFeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <AppFeedbackBridge>{children}</AppFeedbackBridge>
    </NotificationProvider>
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
