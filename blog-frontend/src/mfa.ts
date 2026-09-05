export const STEP_UP_MFA_REQUIRED_EVENT = "gouno:step-up-mfa-required";
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
 * the opener window if so.
 */
export function checkAndHandleStepUpPopupCallback(): boolean {
  if (typeof window === "undefined" || !window.opener) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(STEP_UP_POPUP_PARAM) === "1" || params.get("step_up_success") === "1") {
    try {
      window.opener.postMessage(
        { type: STEP_UP_MESSAGE_TYPE },
        window.location.origin,
      );
      window.close();
      return true;
    } catch {
      return false;
    }
  }
  return false;
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

  const cleanup = () => {
    window.removeEventListener("message", messageListener);
    if (timer) clearInterval(timer);
  };

  const messageListener = (event: MessageEvent) => {
    if (
      event.origin === window.location.origin &&
      event.data?.type === STEP_UP_MESSAGE_TYPE
    ) {
      cleanup();
      onSuccess?.();
    }
  };

  window.addEventListener("message", messageListener);

  timer = setInterval(() => {
    if (!popup || popup.closed) {
      cleanup();
      onCancel?.();
    }
  }, 600);

  return true;
}
