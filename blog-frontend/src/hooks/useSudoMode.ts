import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  openStepUpPopup,
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_POPUP_PARAM,
} from "../mfa";
import {
  clearSudo,
  getServerSudoSnapshot,
  getSudoSnapshot,
  recordSudoSuccess,
  refreshSudoSnapshot,
  subscribeSudo,
  SUDO_SESSION_CLEARED_EVENT,
} from "./sudo-session-store";

export {
  SUDO_MAX_AGE_MS,
  SUDO_SESSION_CLEARED_EVENT,
} from "./sudo-session-store";

export interface SudoModeState {
  isSudoActive: boolean;
  isSudoExpiring: boolean;
  remainingMs: number;
  remainingMinutes: number;
  activating: boolean;
  activateSudo: (onSuccess?: () => void) => Promise<boolean>;
  recordSudoSuccess: () => void;
  clearSudo: () => void;
}

export function useSudoMode(): SudoModeState {
  const [activating, setActivating] = useState(false);
  const { remainingMs, stale } = useSyncExternalStore(
    subscribeSudo,
    getSudoSnapshot,
    getServerSudoSnapshot,
  );

  useEffect(() => {
    const handleSettled = () => setActivating(false);
    window.addEventListener(STEP_UP_COMPLETED_EVENT, handleSettled);
    window.addEventListener(SUDO_SESSION_CLEARED_EVENT, handleSettled);
    return () => {
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, handleSettled);
      window.removeEventListener(SUDO_SESSION_CLEARED_EVENT, handleSettled);
    };
  }, []);

  const activateSudo = useCallback(
    async (onSuccess?: () => void): Promise<boolean> => {
      setActivating(true);
      return new Promise<boolean>((resolve) => {
        const opened = openStepUpPopup(
          `/admin?${STEP_UP_POPUP_PARAM}=1`,
          () => {
            recordSudoSuccess();
            setActivating(false);
            if (onSuccess) onSuccess();
            resolve(true);
          },
          () => {
            refreshSudoSnapshot();
            setActivating(false);
            resolve(false);
          },
        );
        if (!opened) {
          setActivating(false);
          resolve(false);
        }
      });
    },
    [],
  );

  // Preserve the existing active/expiring visual contract. Neither field is an
  // authorization decision; every privileged request is checked by the server.
  const isSudoActive = remainingMs > 0;
  const isSudoExpiring = isSudoActive && stale;
  const remainingMinutes = Math.ceil(remainingMs / 60000);

  return {
    isSudoActive,
    isSudoExpiring,
    remainingMs,
    remainingMinutes,
    activating,
    activateSudo,
    recordSudoSuccess,
    clearSudo,
  };
}
