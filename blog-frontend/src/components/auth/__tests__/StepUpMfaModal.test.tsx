import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("starts a provider-owned step-up navigation when popup is not available", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

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
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("completes step-up via popup and triggers onSuccess callback seamlessly", async () => {
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

    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });
});
