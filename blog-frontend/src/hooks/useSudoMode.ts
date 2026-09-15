import { useCallback, useEffect, useState } from "react";
import {
  openStepUpPopup,
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_POPUP_PARAM,
  SUDO_SESSION_STALE_EVENT,
} from "../mfa";

const SUDO_STORAGE_KEY = "gouno:sudo_activated_at";
export const SUDO_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes, aligns with backend recent MFA validity

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
  const [sudoSessionStale, setSudoSessionStale] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(SUDO_STORAGE_KEY);
      if (!stored) return 0;
      const ts = parseInt(stored, 10);
      if (isNaN(ts)) return 0;
      return Math.max(0, ts + SUDO_MAX_AGE_MS - Date.now());
    } catch {
      return 0;
    }
  });

  const updateRemaining = useCallback(() => {
    try {
      const stored = localStorage.getItem(SUDO_STORAGE_KEY);
      if (!stored) {
        setRemainingMs(0);
        return;
      }
      const ts = parseInt(stored, 10);
      if (isNaN(ts)) {
        setRemainingMs(0);
        return;
      }
      const diff = ts + SUDO_MAX_AGE_MS - Date.now();
      setRemainingMs(Math.max(0, diff));
    } catch {
      setRemainingMs(0);
    }
  }, []);

  const recordSudoSuccess = useCallback(() => {
    try {
      localStorage.setItem(SUDO_STORAGE_KEY, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
    setSudoSessionStale(false);
    updateRemaining();
  }, [updateRemaining]);

  const clearSudo = useCallback(() => {
    try {
      localStorage.removeItem(SUDO_STORAGE_KEY);
    } catch {
      // Ignore
    }
    setSudoSessionStale(false);
    setRemainingMs(0);
  }, []);

  useEffect(() => {
    updateRemaining();
    const interval = setInterval(updateRemaining, 3000);

    const handleCompleted = () => {
      recordSudoSuccess();
      setActivating(false);
    };

    const handleSudoSessionStale = () => {
      setSudoSessionStale(true);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SUDO_STORAGE_KEY || e.key === "gouno_step_up_event") {
        if (e.newValue) setSudoSessionStale(false);
        updateRemaining();
        setActivating(false);
      }
    };

    const handleFocus = () => {
      updateRemaining();
    };

    window.addEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
    window.addEventListener(SUDO_SESSION_STALE_EVENT, handleSudoSessionStale);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
      window.removeEventListener(
        SUDO_SESSION_STALE_EVENT,
        handleSudoSessionStale,
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [recordSudoSuccess, updateRemaining]);

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
            updateRemaining();
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
    [recordSudoSuccess, updateRemaining],
  );

  const isSudoActive = remainingMs > 0;
  const isSudoExpiring = isSudoActive && sudoSessionStale;
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
