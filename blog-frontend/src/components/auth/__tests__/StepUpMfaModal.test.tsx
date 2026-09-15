import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepUpMfaModal } from "../StepUpMfaModal";

import * as mfaModule from "../../../mfa";

vi.mock("../../../auth", () => ({
  stepUpMfa: vi.fn(),
  gossoAdminURL: "https://auth.example.com",
  getGossoAdminURL: () => "https://auth.example.com",
  useSafeUserProfile: () => ({
    principal: { issuer: "https://auth.example.com" },
  }),
}));

import { stepUpMfa } from "../../../auth";
import { AppFeedbackProvider } from "../../feedback/AppFeedbackProvider";

describe("StepUpMfaModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the current sudo session stale when step-up becomes required", () => {
    const listener = vi.fn();
    window.addEventListener(mfaModule.SUDO_SESSION_STALE_EVENT, listener);

    render(
      <AppFeedbackProvider>
        <StepUpMfaModal open={true} onClose={vi.fn()} />
      </AppFeedbackProvider>,
    );

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(mfaModule.SUDO_SESSION_STALE_EVENT, listener);
  });

  it("emits cancellation only when the user explicitly closes the Step-Up flow", async () => {
    const onClose = vi.fn();
    const listener = vi.fn();
    window.addEventListener(mfaModule.STEP_UP_CANCELLED_EVENT, listener);

    render(
      <AppFeedbackProvider>
        <StepUpMfaModal open={true} onClose={onClose} />
      </AppFeedbackProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(listener).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    window.removeEventListener(mfaModule.STEP_UP_CANCELLED_EVENT, listener);
  });

  it("starts a provider-owned step-up navigation when popup is not available", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const cancelListener = vi.fn();
    window.addEventListener(
      mfaModule.STEP_UP_CANCELLED_EVENT,
      cancelListener,
    );

    vi.spyOn(mfaModule, "openStepUpPopup").mockReturnValue(false);

    render(
      <AppFeedbackProvider>
        <StepUpMfaModal open={true} onClose={onClose} onSuccess={onSuccess} />
      </AppFeedbackProvider>,
    );

    expect(screen.getByText("高权限安全验证")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: "前往统一身份中心" });
    await userEvent.click(submitBtn);

    expect(stepUpMfa).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(cancelListener).not.toHaveBeenCalled();
    window.removeEventListener(
      mfaModule.STEP_UP_CANCELLED_EVENT,
      cancelListener,
    );
  });

  it("completes step-up via popup and triggers onSuccess exactly once", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    vi.spyOn(mfaModule, "openStepUpPopup").mockImplementation(
      (_returnTo, successCb) => {
        successCb?.();
        return true;
      },
    );

    render(
      <AppFeedbackProvider>
        <StepUpMfaModal open={true} onClose={onClose} onSuccess={onSuccess} />
      </AppFeedbackProvider>,
    );

    const submitBtn = screen.getByRole("button", { name: "前往统一身份中心" });
    await userEvent.click(submitBtn);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
