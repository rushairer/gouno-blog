export const STEP_UP_MFA_REQUIRED_EVENT = "gouno:step-up-mfa-required";
export const STEP_UP_COMPLETED_EVENT = "gouno:step-up-completed";
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

/**
 * Opens a popup window to complete MFA step-up verification seamlessly
 * without reloading or leaving the current application page.
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
  let broadcastChannel: BroadcastChannel | null = null;
  let completed = false;

  const triggerSuccess = () => {
    if (completed) return;
    completed = true;
    cleanup();
    try {
      localStorage.setItem("gouno:sudo_activated_at", Date.now().toString());
    } catch {
      // Ignore
    }
    try {
      if (popup && !popup.closed) {
        popup.close();
      }
    } catch {
      // Ignore close error
    }
    window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
    onSuccess?.();
  };

  const cleanup = () => {
    window.removeEventListener("message", messageListener);
    window.removeEventListener("storage", storageListener);
    if (broadcastChannel) {
      try {
        broadcastChannel.close();
      } catch {
        // Ignore
      }
      broadcastChannel = null;
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const messageListener = (event: MessageEvent) => {
    if (
      event.origin === window.location.origin &&
      event.data?.type === STEP_UP_MESSAGE_TYPE
    ) {
      triggerSuccess();
    }
  };

  const storageListener = (event: StorageEvent) => {
    if (
      (event.key === "gouno_step_up_event" || event.key === "gouno:sudo_activated_at") &&
      event.newValue
    ) {
      triggerSuccess();
    }
  };

  // 1. Listen for window.postMessage
  window.addEventListener("message", messageListener);

  // 2. Listen for Storage events (cross-window on same origin)
  window.addEventListener("storage", storageListener);

  // 3. Listen for BroadcastChannel messages (robust modern standard)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel("gouno_mfa_step_up");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === STEP_UP_MESSAGE_TYPE) {
          triggerSuccess();
        }
      };
    }
  } catch {
    // Ignore BroadcastChannel errors
  }

  // 4. Poll for popup closed state with recent auth detection
  timer = setInterval(() => {
    if (!popup || popup.closed) {
      if (!completed) {
        let recentAuth = false;
        try {
          const sudoTime = localStorage.getItem("gouno:sudo_activated_at");
          if (sudoTime && Math.abs(Date.now() - parseInt(sudoTime, 10)) < 15000) {
            recentAuth = true;
          }
          const stepUpEvent = localStorage.getItem("gouno_step_up_event");
          if (stepUpEvent) {
            const data = JSON.parse(stepUpEvent);
            if (data?.timestamp && Math.abs(Date.now() - data.timestamp) < 15000) {
              recentAuth = true;
            }
          }
        } catch {
          // Ignore
        }

        if (recentAuth) {
          triggerSuccess();
        } else {
          // Wait briefly in case storage/broadcast events are still propagating
          setTimeout(() => {
            if (!completed) {
              try {
                const sudoTime = localStorage.getItem("gouno:sudo_activated_at");
                if (sudoTime && Math.abs(Date.now() - parseInt(sudoTime, 10)) < 15000) {
                  triggerSuccess();
                  return;
                }
              } catch {
                // Ignore
              }
              cleanup();
              onCancel?.();
            }
          }, 400);
        }
      }
    }
  }, 300);

  return true;
}
