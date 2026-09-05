import { useCallback, useEffect, useRef } from "react";
import { STEP_UP_MFA_REQUIRED_EVENT } from "../mfa";

const DRAFT_PREFIX = "gouno-blog:draft:";

export interface UseFormDraftOptions<T> {
  enabled?: boolean;
  autoRestore?: boolean;
  onRestored?: (draft: T) => void;
}

export function getFormDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setFormDraft<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(value));
  } catch {}
}

export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${key}`);
  } catch {}
}

/**
 * useFormDraft saves and restores in-progress form inputs to sessionStorage.
 * It automatically snapshots state before Step-Up MFA redirections to ensure
 * zero data loss, and auto-restores draft state upon returning to the form.
 */
export function useFormDraft<T>(
  key: string,
  value: T,
  setValue?: (val: T | ((prev: T) => T)) => void,
  options: UseFormDraftOptions<T> = {},
) {
  const { enabled = true, autoRestore = true, onRestored } = options;
  const valueRef = useRef(value);
  valueRef.current = value;
  const hasRestoredRef = useRef(false);

  const save = useCallback(
    (customValue?: T) => {
      if (!enabled) return;
      setFormDraft(
        key,
        customValue !== undefined ? customValue : valueRef.current,
      );
    },
    [enabled, key],
  );

  const clear = useCallback(() => {
    clearFormDraft(key);
  }, [key]);

  const restore = useCallback((): T | null => {
    const draft = getFormDraft<T>(key);
    if (draft !== null) {
      if (setValue) {
        setValue((prev) => {
          if (
            typeof prev === "object" &&
            prev !== null &&
            typeof draft === "object" &&
            draft !== null
          ) {
            return { ...prev, ...draft };
          }
          return draft;
        });
      }
      if (onRestored) {
        onRestored(draft);
      }
    }
    return draft;
  }, [key, onRestored, setValue]);

  // Auto-restore on mount if a draft exists
  useEffect(() => {
    if (!enabled || !autoRestore || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    restore();
  }, [autoRestore, enabled, restore]);

  // Automatically snapshot draft when a step-up MFA challenge is triggered
  useEffect(() => {
    if (!enabled) return;

    const handleStepUpRequired = () => {
      save();
    };

    window.addEventListener(STEP_UP_MFA_REQUIRED_EVENT, handleStepUpRequired);
    return () => {
      window.removeEventListener(
        STEP_UP_MFA_REQUIRED_EVENT,
        handleStepUpRequired,
      );
    };
  }, [enabled, save]);

  return {
    saveDraft: save,
    clearDraft: clear,
    restoreDraft: restore,
    getDraft: () => getFormDraft<T>(key),
  };
}
