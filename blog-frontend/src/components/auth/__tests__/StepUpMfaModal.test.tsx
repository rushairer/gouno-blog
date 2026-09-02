import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepUpMfaModal } from "../StepUpMfaModal";
import { ToastProvider } from "../../ui";

vi.mock("../../../auth", () => ({
  stepUpMfa: vi.fn(),
  gossoAdminURL: "https://auth.example.com",
  getGossoAdminURL: () => "https://auth.example.com",
  useSafeUserProfile: () => ({
    principal: { issuer: "https://auth.example.com" },
  }),
}));

import { stepUpMfa } from "../../../auth";

describe("StepUpMfaModal", () => {
  it("starts a provider-owned step-up navigation", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ToastProvider>
        <StepUpMfaModal open={true} onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>,
    );

    expect(screen.getByText("高权限安全验证")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: "前往统一身份中心" });
    await userEvent.click(submitBtn);

    expect(stepUpMfa).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
