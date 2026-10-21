export const STEP_UP_MFA_REQUIRED_EVENT = "gouno:step-up-mfa-required";
export const STEP_UP_COMPLETED_EVENT = "gouno:step-up-completed";
export const STEP_UP_CANCELLED_EVENT = "gouno:step-up-cancelled";
export const SUDO_SESSION_STALE_EVENT = "gouno:sudo-session-stale";
export const STEP_UP_MFA_QUERY_PARAM = "mfa_step_up";
export const STEP_UP_POPUP_PARAM = "step_up_popup";
export const STEP_UP_MESSAGE_TYPE = "GOUNO_STEP_UP_COMPLETED";

export function isMfaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  const lower = message.toLowerCase();
  return (
    lower.includes("recent_mfa_required") ||
    lower.includes("recent multi-factor") ||
    lower.includes("multi-factor") ||
    lower.includes("mfa_required")
  );
}

export function requestStepUpMfaPrompt(): void {
  window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
}

export function markSudoSessionStale(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT));
}

/**
 * Checks if the current window is an MFA step-up popup callback and notifies
 * the opener window via BroadcastChannel, localStorage, and postMessage.
 */
export function checkAndHandleStepUpPopupCallback(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const isPopup =
    params.get(STEP_UP_POPUP_PARAM) === "1" ||
    params.get("step_up_success") === "1";
  if (!isPopup) return false;

  const now = Date.now();

  // 1. Storage Event: Cross-tab / cross-window persistence (write both keys)
  try {
    localStorage.setItem("gouno:sudo_activated_at", now.toString());
    localStorage.setItem(
      "gouno_step_up_event",
      JSON.stringify({
        type: STEP_UP_MESSAGE_TYPE,
        timestamp: now,
      }),
    );
  } catch {
    // Ignore localStorage errors
  }

  // 2. BroadcastChannel: Works seamlessly between same-origin windows even if COOP severed window.opener
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("gouno_mfa_step_up");
      channel.postMessage({
        type: STEP_UP_MESSAGE_TYPE,
        timestamp: now,
      });
      // Do not close immediately to prevent cancellation in browser event loop
      setTimeout(() => {
        try {
          channel.close();
        } catch {
          // Ignore
        }
      }, 1000);
    }
  } catch {
    // Ignore BroadcastChannel errors
  }

  // 3. postMessage to window.opener if still linked
  try {
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(
        { type: STEP_UP_MESSAGE_TYPE, timestamp: now },
        window.location.origin,
      );
    }
  } catch {
    // Ignore postMessage errors
  }

  // 4. Attempt to close the popup window automatically
  try {
    window.close();
  } catch {
    // Ignore window.close errors
  }

  return true;
}

const STEP_UP_STORAGE_KEY = "gouno_step_up_event";
const SUDO_ACTIVATED_STORAGE_KEY = "gouno:sudo_activated_at";

function completionTimestamp(data: unknown): number | null {
  try {
    if (!data || typeof data !== "object") return null;
    const { type, timestamp } = data as { type?: unknown; timestamp?: unknown };
    return type === STEP_UP_MESSAGE_TYPE &&
      typeof timestamp === "number" &&
      Number.isSafeInteger(timestamp) &&
      timestamp > 0
      ? timestamp
      : null;
  } catch {
    return null;
  }
}

function storedCompletionTimestamp(key: string | null, raw: string | null) {
  if (!raw) return null;
  if (key === SUDO_ACTIVATED_STORAGE_KEY) {
    const timestamp = /^\d+$/.test(raw) ? Number(raw) : NaN;
    return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null;
  }
  if (key === STEP_UP_STORAGE_KEY) {
    try {
      return completionTimestamp(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Opens the existing BFF step-up flow without leaving the application page.
 * Completion messages are UI hints, never proof of server-side authorization.
 */
export function openStepUpPopup(
  returnTo = `/admin?${STEP_UP_POPUP_PARAM}=1`,
  onSuccess?: () => void,
  onCancel?: () => void,
): boolean {
  if (typeof window === "undefined") return false;

  const width = 520;
  const height = 680;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

  const startedAt = Date.now();
  const initialTimestamps = new Set<number>();
  for (const key of [SUDO_ACTIVATED_STORAGE_KEY, STEP_UP_STORAGE_KEY]) {
    try {
      const timestamp = storedCompletionTimestamp(
        key,
        localStorage.getItem(key),
      );
      if (timestamp !== null) initialTimestamps.add(timestamp);
    } catch {
      // Storage may be unavailable; the other transports still work.
    }
  }

  const url = `/api/auth/mfa/step-up?return_to=${encodeURIComponent(returnTo)}`;
  let popup: Window | null = null;
  try {
    popup = window.open(
      url,
      "gouno_step_up_window",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`,
    );
  } catch {
    return false;
  }

  if (!popup || popup.closed || typeof popup.closed === "undefined") {
    return false; // Popup was blocked by browser
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;
  let broadcastChannel: BroadcastChannel | null = null;
  let completed = false;

  const isFresh = (timestamp: number | null) => {
    const now = Date.now();
    return (
      timestamp !== null &&
      timestamp >= startedAt &&
      timestamp <= now &&
      now - timestamp < 15_000 &&
      !initialTimestamps.has(timestamp)
    );
  };

  const hasFreshStoredCompletion = () => {
    for (const key of [SUDO_ACTIVATED_STORAGE_KEY, STEP_UP_STORAGE_KEY]) {
      try {
        if (
          isFresh(storedCompletionTimestamp(key, localStorage.getItem(key)))
        ) {
          return true;
        }
      } catch {
        // Inspect each key independently; malformed data is not success.
      }
    }
    return false;
  };

  const cleanup = () => {
    window.removeEventListener("message", messageListener);
    window.removeEventListener("storage", storageListener);
    if (broadcastChannel) {
      broadcastChannel.onmessage = null;
      try {
        broadcastChannel.close();
      } catch {
        // Ignore
      }
      broadcastChannel = null;
    }
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (closeTimeout !== null) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  };

  const triggerSuccess = () => {
    if (completed) return;
    completed = true;
    cleanup();
    try {
      localStorage.setItem(SUDO_ACTIVATED_STORAGE_KEY, Date.now().toString());
    } catch {
      // Ignore
    }
    try {
      if (popup && !popup.closed) popup.close();
    } catch {
      // Ignore close error
    }
    window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
    onSuccess?.();
  };

  const triggerCancel = () => {
    if (completed) return;
    completed = true;
    cleanup();
    onCancel?.();
  };

  const messageListener = (event: MessageEvent) => {
    if (
      event.origin === window.location.origin &&
      event.source === popup &&
      isFresh(completionTimestamp(event.data))
    ) {
      triggerSuccess();
    }
  };

  const storageListener = (event: StorageEvent) => {
    let fresh = false;
    try {
      fresh =
        event.storageArea === localStorage &&
        isFresh(storedCompletionTimestamp(event.key, event.newValue));
    } catch {
      // Ignore inaccessible storage.
    }
    if (fresh) triggerSuccess();
  };

  window.addEventListener("message", messageListener);
  window.addEventListener("storage", storageListener);

  // These same-origin transports still work when COOP severs window.opener.
  try {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel("gouno_mfa_step_up");
      broadcastChannel.onmessage = (event) => {
        if (isFresh(completionTimestamp(event.data))) triggerSuccess();
      };
    }
  } catch {
    // Ignore BroadcastChannel errors.
  }

  timer = setInterval(() => {
    if (!popup || !popup.closed || completed) return;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (hasFreshStoredCompletion()) {
      triggerSuccess();
      return;
    }
    // Exactly one grace period; keep listeners until it expires or succeeds.
    closeTimeout = setTimeout(() => {
      closeTimeout = null;
      if (completed) return;
      if (hasFreshStoredCompletion()) triggerSuccess();
      else triggerCancel();
    }, 400);
  }, 300);

  return true;
}
