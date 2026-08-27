import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepUpMfaModal } from "../StepUpMfaModal";
import { ToastProvider } from "../../ui";

vi.mock("../../../auth", () => ({
  stepUpMfa: vi.fn(),
  gossoAdminURL: "https://auth.example.com",
}));

import { stepUpMfa } from "../../../auth";

describe("StepUpMfaModal", () => {
  it("renders when open and submits TOTP code", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(stepUpMfa).mockResolvedValueOnce({
      auth_time: Date.now(),
      amr: ["pwd", "otp"],
    });

    render(
      <ToastProvider>
        <StepUpMfaModal open={true} onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>,
    );

    expect(screen.getByText("高权限安全验证")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("输入 6 位身份验证器动态码");
    await userEvent.type(input, "123456");

    const submitBtn = screen.getByRole("button", { name: "验证并继续" });
    await userEvent.click(submitBtn);

    expect(stepUpMfa).toHaveBeenCalledWith("123456", "totp");
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("handles verification error gracefully", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(stepUpMfa).mockRejectedValueOnce(new Error("invalid verification code"));

    render(
      <ToastProvider>
        <StepUpMfaModal open={true} onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>,
    );

    const input = screen.getByPlaceholderText("输入 6 位身份验证器动态码");
    await userEvent.type(input, "000000");

    const submitBtn = screen.getByRole("button", { name: "验证并继续" });
    await userEvent.click(submitBtn);

    expect(await screen.findByText("验证码错误或已过期，请重新输入。")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
