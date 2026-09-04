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
import { STEP_UP_MFA_REQUIRED_EVENT } from "../../mfa";

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

  it("requests Step-Up UI for a protected AI operation", async () => {
    const listener = listenForStepUp();
    postMock.mockRejectedValueOnce(
      new Error("recent multi-factor authentication required"),
    );

    await expect(
      apiClient.post("/api/admin/provider-profiles/1/test"),
    ).rejects.toThrow("recent multi-factor authentication required");
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
