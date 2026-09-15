import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postMock, apiFetchMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("../../auth", () => ({
  gossoClient: {
    post: postMock,
    apiFetch: apiFetchMock,
  },
}));

import { apiClient } from "../client";
import {
  STEP_UP_CANCELLED_EVENT,
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_MFA_REQUIRED_EVENT,
} from "../../mfa";

const listeners: EventListener[] = [];

function listenForStepUp() {
  const listener = vi.fn();
  window.addEventListener(STEP_UP_MFA_REQUIRED_EVENT, listener);
  listeners.push(listener as EventListener);
  return listener;
}

describe("AI API high-privilege interception", () => {
  beforeEach(() => {
    postMock.mockReset();
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    for (const listener of listeners.splice(0)) {
      window.removeEventListener(STEP_UP_MFA_REQUIRED_EVENT, listener);
    }
  });

  it("holds and replays a protected AI operation after successful Step-Up", async () => {
    const listener = listenForStepUp();
    postMock
      .mockRejectedValueOnce(
        new Error("recent multi-factor authentication required"),
      )
      .mockResolvedValueOnce({ ok: true });

    const pending = apiClient.post("/api/admin/provider-profiles/1/test");

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(postMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));

    await expect(pending).resolves.toEqual({ ok: true });
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it("rejects the held AI operation when Step-Up is explicitly cancelled", async () => {
    const listener = listenForStepUp();
    postMock.mockRejectedValueOnce(
      new Error("recent multi-factor authentication required"),
    );

    const pending = apiClient.post("/api/admin/provider-profiles/1/test");

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event(STEP_UP_CANCELLED_EVENT));

    await expect(pending).rejects.toThrow(
      "recent multi-factor authentication required",
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry indefinitely when the backend still requires MFA", async () => {
    const listener = listenForStepUp();
    postMock.mockRejectedValue(
      new Error("recent multi-factor authentication required"),
    );

    const pending = apiClient.post("/api/admin/provider-profiles/1/test");

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT));

    await expect(pending).rejects.toThrow(
      "recent multi-factor authentication required",
    );
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not claim unrelated administration errors as AI Step-Up", async () => {
    const listener = listenForStepUp();
    postMock.mockRejectedValueOnce(
      new Error("recent multi-factor authentication required"),
    );

    await expect(apiClient.post("/api/admin/settings")).rejects.toThrow(
      "recent multi-factor authentication required",
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
