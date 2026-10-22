import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSudoMode, SUDO_MAX_AGE_MS } from "../useSudoMode";
import {
  openStepUpPopup,
  STEP_UP_COMPLETED_EVENT,
  SUDO_SESSION_STALE_EVENT,
} from "../../mfa";

vi.mock("../../mfa", () => ({
  openStepUpPopup: vi.fn(),
  STEP_UP_POPUP_PARAM: "step_up_popup",
  STEP_UP_COMPLETED_EVENT: "gouno:step-up-completed",
  SUDO_SESSION_STALE_EVENT: "gouno:sudo-session-stale",
}));

const KEY = "gouno:sudo_activated_at";
const NOW = Date.parse("2026-10-22T12:00:00Z");

function storageEvent(
  key: string | null,
  area: Storage | null = localStorage,
  newValue = key === null ? null : localStorage.getItem(key) || "invalid",
) {
  // The shared setup installs a Storage double, not a native jsdom Storage.
  // Model the event source explicitly without weakening production checks.
  const event = new StorageEvent("storage", { key, newValue });
  Object.defineProperty(event, "storageArea", { value: area });
  window.dispatchEvent(event);
}

describe("Sudo presentation state boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    vi.mocked(openStepUpPopup).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear through the public API before unmounting the last subscriber.
    const reset = renderHook(() => useSudoMode());
    act(() => reset.result.current.clearSudo());
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  it.each([
    `${NOW}suffix`,
    ` ${NOW}`,
    `${NOW} `,
    `+${NOW}`,
    `${NOW}.5`,
    "1e20",
    "Infinity",
    "NaN",
    "-1",
    "0",
    String(Number.MAX_SAFE_INTEGER + 1),
    String(NOW + 1),
    String(NOW + SUDO_MAX_AGE_MS),
  ])("rejects malformed or future activation %s", (value) => {
    localStorage.setItem(KEY, value);
    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.remainingMs).toBe(0);
  });

  it.each([0, 1, SUDO_MAX_AGE_MS - 1, SUDO_MAX_AGE_MS])(
    "bounds the remaining lifetime for age %i",
    (age) => {
      localStorage.setItem(KEY, String(NOW - age));
      const { result } = renderHook(() => useSudoMode());
      expect(result.current.remainingMs).toBe(SUDO_MAX_AGE_MS - age);
      expect(result.current.isSudoActive).toBe(age < SUDO_MAX_AGE_MS);
    },
  );

  it("updates every same-document subscriber immediately after success", () => {
    const first = renderHook(() => useSudoMode());
    const second = renderHook(() => useSudoMode());
    act(() => first.result.current.recordSudoSuccess());
    expect(first.result.current.isSudoActive).toBe(true);
    expect(second.result.current.isSudoActive).toBe(true);
    expect(second.result.current.remainingMs).toBe(SUDO_MAX_AGE_MS);
    act(() => second.result.current.clearSudo());
    expect(first.result.current.isSudoActive).toBe(false);
    expect(second.result.current.isSudoActive).toBe(false);
  });

  it.each(["gouno_step_up_event", KEY])(
    "does not clear stale state for an unchanged storage hint %s",
    (key) => {
      localStorage.setItem(KEY, String(NOW));
      const { result } = renderHook(() => useSudoMode());
      act(() => window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT)));
      act(() => storageEvent(key));
      expect(result.current.isSudoExpiring).toBe(true);
      expect(result.current.isSudoActive).toBe(true);
    },
  );

  it.each(["session", "missing"])(
    "ignores storage notifications from a %s storage area",
    (area) => {
      localStorage.setItem(KEY, String(NOW));
      const { result } = renderHook(() => useSudoMode());
      act(() => window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT)));
      act(() => storageEvent(KEY, area === "session" ? sessionStorage : null));
      expect(result.current.isSudoExpiring).toBe(true);
      expect(result.current.isSudoActive).toBe(true);
    },
  );

  it("keeps a backend rejection across unmount and remount", () => {
    localStorage.setItem(KEY, String(NOW));
    const first = renderHook(() => useSudoMode());
    act(() => window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT)));
    first.unmount();
    const second = renderHook(() => useSudoMode());
    expect(second.result.current.isSudoExpiring).toBe(true);
    expect(second.result.current.isSudoActive).toBe(true);
  });

  it("accepts a newer valid cross-tab hint but never event payload alone", () => {
    localStorage.setItem(KEY, String(NOW));
    const { result } = renderHook(() => useSudoMode());
    act(() => window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT)));
    vi.setSystemTime(NOW + 1000);
    act(() => storageEvent(KEY, localStorage, String(NOW + 1000)));
    expect(result.current.isSudoExpiring).toBe(true);
    act(() => {
      localStorage.setItem(KEY, String(NOW + 1000));
      storageEvent(KEY);
    });
    expect(result.current.isSudoActive).toBe(true);
    expect(result.current.isSudoExpiring).toBe(false);
  });

  it("handles cross-tab clear immediately without waiting for a timer", () => {
    localStorage.setItem(KEY, String(NOW));
    const { result } = renderHook(() => useSudoMode());
    act(() => {
      localStorage.clear();
      storageEvent(null);
    });
    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it("does not let a synthetic clear reset a still-stored stale hint", () => {
    localStorage.setItem(KEY, String(NOW));
    const { result } = renderHook(() => useSudoMode());
    act(() => window.dispatchEvent(new Event(SUDO_SESSION_STALE_EVENT)));
    act(() => storageEvent(null));
    expect(result.current.isSudoActive).toBe(true);
    expect(result.current.isSudoExpiring).toBe(true);
  });

  it("does not revive a cleared hint when storage removal fails", () => {
    localStorage.setItem(KEY, String(NOW));
    const first = renderHook(() => useSudoMode());
    const second = renderHook(() => useSudoMode());
    const remove = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    act(() => first.result.current.clearSudo());
    expect(remove).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3000));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(first.result.current.isSudoActive).toBe(false);
    expect(second.result.current.isSudoActive).toBe(false);
  });

  it("fails closed when recording success cannot replace an old hint", () => {
    localStorage.setItem(KEY, String(NOW - 1000));
    const { result } = renderHook(() => useSudoMode());
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    act(() => result.current.recordSudoSuccess());
    expect(write).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it("does not enlarge a lifetime after the wall clock moves backwards", () => {
    localStorage.setItem(KEY, String(NOW));
    const { result } = renderHook(() => useSudoMode());
    vi.setSystemTime(NOW - 1000);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it("keeps a pending popup busy across unrelated storage noise", async () => {
    let cancel: (() => void) | undefined;
    vi.mocked(openStepUpPopup).mockImplementation(
      (_returnTo, _success, onCancel) => {
        cancel = onCancel;
        return true;
      },
    );
    const { result } = renderHook(() => useSudoMode());
    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = result.current.activateSudo();
    });
    act(() => storageEvent("gouno_step_up_event"));
    expect(result.current.activating).toBe(true);
    await act(async () => {
      cancel?.();
      expect(await pending).toBe(false);
    });
    expect(result.current.activating).toBe(false);
  });

  it("keeps completion hints usable and shares one polling subscription", () => {
    const baselineTimers = vi.getTimerCount();
    const first = renderHook(() => useSudoMode());
    const second = renderHook(() => useSudoMode());
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);
    act(() => window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT)));
    expect(first.result.current.isSudoActive).toBe(true);
    expect(second.result.current.isSudoActive).toBe(true);
    first.unmount();
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);
    second.unmount();
    expect(vi.getTimerCount()).toBe(baselineTimers);
  });

  it("expires all subscribers on the shared polling clock", () => {
    localStorage.setItem(KEY, String(NOW));
    const first = renderHook(() => useSudoMode());
    const second = renderHook(() => useSudoMode());
    act(() => vi.advanceTimersByTime(SUDO_MAX_AGE_MS));
    expect(first.result.current.remainingMs).toBe(0);
    expect(second.result.current.isSudoActive).toBe(false);
  });

  it("shows no active hint when storage reads become unavailable", () => {
    localStorage.setItem(KEY, String(NOW));
    const { result } = renderHook(() => useSudoMode());
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(read).toHaveBeenCalled();
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.isSudoActive).toBe(false);
  });

  it("preserves popup-blocked resolution without creating an active hint", async () => {
    vi.mocked(openStepUpPopup).mockReturnValue(false);
    const { result } = renderHook(() => useSudoMode());
    await act(async () => {
      expect(await result.current.activateSudo()).toBe(false);
    });
    expect(result.current.activating).toBe(false);
    expect(result.current.isSudoActive).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("preserves the success callback and shares its hint immediately", async () => {
    const onSuccess = vi.fn();
    vi.mocked(openStepUpPopup).mockImplementation((_returnTo, success) => {
      success?.();
      return true;
    });
    const first = renderHook(() => useSudoMode());
    const second = renderHook(() => useSudoMode());
    await act(async () => {
      expect(await first.result.current.activateSudo(onSuccess)).toBe(true);
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(openStepUpPopup).toHaveBeenCalledWith(
      "/admin?step_up_popup=1",
      expect.any(Function),
      expect.any(Function),
    );
    expect(first.result.current.activating).toBe(false);
    expect(second.result.current.isSudoActive).toBe(true);
  });
});
