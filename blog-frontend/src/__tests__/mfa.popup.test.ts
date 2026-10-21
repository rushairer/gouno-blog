import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openStepUpPopup,
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_MESSAGE_TYPE,
} from "../mfa";
import { useSudoMode } from "../hooks/useSudoMode";

const sudoKey = "gouno:sudo_activated_at";
const eventKey = "gouno_step_up_event";
const startedAt = 1_700_000_000_000;
const onSuccess = vi.fn();
const onCancel = vi.fn();
const onCompleted = vi.fn();
let popup: { closed: boolean; close: ReturnType<typeof vi.fn> };

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
  constructor(_name: string) {
    TestBroadcastChannel.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

function message(timestamp: unknown = Date.now()) {
  return { type: STEP_UP_MESSAGE_TYPE, timestamp };
}

function open() {
  return openStepUpPopup("/admin?step_up_popup=1", onSuccess, onCancel);
}

function sendMessage(
  data: unknown = message(),
  origin = window.location.origin,
  source: MessageEventSource | null = popup as unknown as Window,
) {
  const event = new MessageEvent("message", { data, origin });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
}

function sendStorage(key: string, value: string, area = localStorage) {
  const event = new StorageEvent("storage", { key, newValue: value });
  // The shared setup installs a plain storage mock, not a JSDOM Storage.
  // Preserve identity checks without passing that mock to WebIDL conversion.
  Object.defineProperty(event, "storageArea", { value: area });
  window.dispatchEvent(event);
}

function closeAndDrain() {
  popup.closed = true;
  vi.advanceTimersByTime(1400);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  popup = {
    closed: false,
    close: vi.fn(() => {
      popup.closed = true;
    }),
  };
  vi.spyOn(window, "open").mockImplementation(() => popup as unknown as Window);
  TestBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  window.addEventListener(STEP_UP_COMPLETED_EVENT, onCompleted);
});

afterEach(() => {
  act(closeAndDrain);
  cleanup();
  window.removeEventListener(STEP_UP_COMPLETED_EVENT, onCompleted);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Step-Up popup terminal lifecycle", () => {
  it("opens the existing BFF endpoint with an encoded return path", () => {
    expect(open()).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      "/api/auth/mfa/step-up?return_to=%2Fadmin%3Fstep_up_popup%3D1",
      "gouno_step_up_window",
      expect.stringContaining("width=520,height=680"),
    );
  });

  it.each([null, { closed: true }, {}])(
    "does not install listeners or timers for a blocked popup %s",
    (result) => {
      vi.mocked(window.open).mockReturnValue(result as Window | null);
      const listen = vi.spyOn(window, "addEventListener");
      expect(open()).toBe(false);
      expect(listen).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(TestBroadcastChannel.instances).toHaveLength(0);
      expect(onCompleted).not.toHaveBeenCalled();
    },
  );

  it("returns false when window.open throws", () => {
    vi.mocked(window.open).mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(open()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels once after one grace period without recording success", () => {
    open();
    popup.closed = true;
    vi.advanceTimersByTime(699);
    expect(onCancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(localStorage.getItem(sudoKey)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(TestBroadcastChannel.instances[0].close).toHaveBeenCalledTimes(1);
    expect(TestBroadcastChannel.instances[0].onmessage).toBeNull();
  });

  it("accepts success during grace and clears its timeout", () => {
    open();
    popup.closed = true;
    vi.advanceTimersByTime(300);
    TestBroadcastChannel.instances[0].emit(message());
    vi.advanceTimersByTime(2000);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores queued and late success after cancellation", () => {
    open();
    const queued = TestBroadcastChannel.instances[0].onmessage;
    closeAndDrain();
    queued?.(new MessageEvent("message", { data: message() }));
    sendMessage();
    sendStorage(sudoKey, String(Date.now()));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(localStorage.getItem(sudoKey)).toBeNull();
  });

  it("settles once when postMessage, broadcast, storage and close race", () => {
    open();
    const queued = TestBroadcastChannel.instances[0].onmessage;
    vi.advanceTimersByTime(1);
    sendMessage();
    queued?.(new MessageEvent("message", { data: message() }));
    sendStorage(sudoKey, String(Date.now()));
    closeAndDrain();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans resources even if the success callback throws", () => {
    openStepUpPopup("/admin", () => {
      throw new Error("consumer failure");
    });
    vi.advanceTimersByTime(1);
    expect(() => TestBroadcastChannel.instances[0].emit(message())).toThrow(
      "consumer failure",
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(TestBroadcastChannel.instances[0].onmessage).toBeNull();
  });
});

describe("Step-Up popup completion hints", () => {
  it.each([
    [sudoKey, -1000],
    [sudoKey, 0],
    [eventKey, -1000],
    [eventKey, 0],
  ])("does not reuse an existing %s marker at offset %s", (key, offset) => {
    const timestamp = startedAt + Number(offset);
    const value =
      key === sudoKey ? String(timestamp) : JSON.stringify(message(timestamp));
    localStorage.setItem(String(key), value);
    open();
    sendStorage(String(key), value);
    TestBroadcastChannel.instances[0].emit(message(timestamp));
    closeAndDrain();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(String(key))).toBe(value);
  });

  it("never reuses an initial future marker after the clock catches up", () => {
    localStorage.setItem(sudoKey, String(startedAt + 100));
    open();
    vi.advanceTimersByTime(200);
    closeAndDrain();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    7,
    {},
    { type: "other", timestamp: startedAt },
    message("1700000000000"),
    message(NaN),
    message(Infinity),
    message(-Infinity),
    message(startedAt - 1),
    message(startedAt + 1),
    message(startedAt - 0.5),
  ])("ignores malformed, stale and future message %s", (data) => {
    open();
    TestBroadcastChannel.instances[0].emit(data);
    sendMessage(data);
    expect(onSuccess).not.toHaveBeenCalled();
    closeAndDrain();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("rejects a post-open hint once its original freshness window expires", () => {
    open();
    vi.advanceTimersByTime(1);
    const data = message();
    localStorage.setItem(eventKey, JSON.stringify(data));
    vi.advanceTimersByTime(15_000);
    TestBroadcastChannel.instances[0].emit(data);
    sendMessage(data);
    sendStorage(eventKey, JSON.stringify(data));
    closeAndDrain();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("accepts a fresh hint after the popup has been open for a long time", () => {
    open();
    vi.advanceTimersByTime(20_000);
    TestBroadcastChannel.instances[0].emit(message());
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("contains a throwing timestamp getter without coercing its value", () => {
    open();
    const data = Object.defineProperty(
      { type: STEP_UP_MESSAGE_TYPE },
      "timestamp",
      {
        get() {
          throw new Error("hostile diagnostic");
        },
      },
    );
    expect(() => TestBroadcastChannel.instances[0].emit(data)).not.toThrow();
    closeAndDrain();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("requires both the expected popup source and same origin", () => {
    open();
    vi.advanceTimersByTime(1);
    sendMessage(message(), "https://other.example");
    sendMessage(message(), window.location.origin, window);
    sendMessage(message(), window.location.origin, null);
    expect(onSuccess).not.toHaveBeenCalled();
    sendMessage();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    [eventKey, "not JSON"],
    [eventKey, "null"],
    [eventKey, JSON.stringify({ timestamp: startedAt })],
    [sudoKey, `${startedAt}junk`],
    [sudoKey, "Infinity"],
    [sudoKey, String(startedAt + 1)],
  ])("rejects malformed storage at %s", (key, value) => {
    open();
    sendStorage(key, value);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys and sessionStorage", () => {
    open();
    vi.advanceTimersByTime(1);
    sendStorage("unrelated", String(Date.now()));
    sendStorage(sudoKey, String(Date.now()), sessionStorage);
    sendStorage(eventKey, JSON.stringify(message()), sessionStorage);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it.each([sudoKey, eventKey])("accepts fresh localStorage from %s", (key) => {
    open();
    vi.advanceTimersByTime(1);
    const value =
      key === sudoKey ? String(Date.now()) : JSON.stringify(message());
    sendStorage(key, value);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([sudoKey, eventKey])("polls fresh %s data without events", (key) => {
    open();
    vi.advanceTimersByTime(1);
    const value =
      key === sudoKey ? String(Date.now()) : JSON.stringify(message());
    localStorage.setItem(key, value);
    closeAndDrain();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("checks both storage keys at the end of the grace period", () => {
    open();
    popup.closed = true;
    vi.advanceTimersByTime(300);
    localStorage.setItem(sudoKey, "malformed");
    localStorage.setItem(eventKey, JSON.stringify(message()));
    vi.advanceTimersByTime(400);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps postMessage usable without storage or BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(open()).toBe(true);
    vi.advanceTimersByTime(1);
    sendMessage();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useSudoMode with the real popup helper", () => {
  it("resolves cancellation without executing the success action", async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useSudoMode());
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.activateSudo(action);
    });
    expect(result.current.activating).toBe(true);
    await act(async () => {
      closeAndDrain();
      expect(await pending).toBe(false);
    });
    expect(result.current.activating).toBe(false);
    expect(result.current.isSudoActive).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("resolves fresh completion once and clears activating", async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useSudoMode());
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.activateSudo(action);
    });
    await act(async () => {
      vi.advanceTimersByTime(1);
      sendMessage();
      sendMessage();
      expect(await pending).toBe(true);
    });
    expect(result.current.activating).toBe(false);
    expect(result.current.isSudoActive).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
