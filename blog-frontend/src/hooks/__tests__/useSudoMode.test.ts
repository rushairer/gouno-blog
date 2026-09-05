import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useSudoMode, SUDO_MAX_AGE_MS } from "../useSudoMode";
import { STEP_UP_COMPLETED_EVENT } from "../../mfa";

describe("useSudoMode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("defaults to inactive when no record in localStorage", () => {
    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.remainingMinutes).toBe(0);
  });

  it("calculates active state and remaining minutes correctly", () => {
    const now = Date.now();
    localStorage.setItem(
      "gouno:sudo_activated_at",
      String(now - 2 * 60 * 1000),
    ); // 2 minutes ago

    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudoActive).toBe(true);
    expect(result.current.remainingMinutes).toBe(8); // 10 - 2 = 8 minutes
  });

  it("updates automatically when STEP_UP_COMPLETED_EVENT is dispatched", () => {
    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudoActive).toBe(false);

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));
    });

    expect(result.current.isSudoActive).toBe(true);
    expect(result.current.remainingMinutes).toBe(10);
  });

  it("clears sudo upon clearSudo call", () => {
    const now = Date.now();
    localStorage.setItem("gouno:sudo_activated_at", String(now));

    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudoActive).toBe(true);

    act(() => {
      result.current.clearSudo();
    });

    expect(result.current.isSudoActive).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });
});
