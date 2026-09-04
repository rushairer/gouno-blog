import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalStepUpBoundary } from "../GlobalStepUpBoundary";
import { STEP_UP_MFA_REQUIRED_EVENT } from "../../../mfa";

vi.mock("../../../auth", () => ({
  stepUpMfa: vi.fn(),
  getGossoAdminURL: () => "https://auth.example.com",
}));

describe("GlobalStepUpBoundary", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/ai-ops");
  });

  it("opens the high-privilege verification UI when an AI API requests step-up", async () => {
    render(
      <GlobalStepUpBoundary>
        <div>AI console</div>
      </GlobalStepUpBoundary>,
    );

    act(() => {
      window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
    });

    expect(await screen.findByText("高权限安全验证")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "前往统一身份中心" }),
    ).toBeInTheDocument();
  });

  it("consumes the one-shot navigation query and opens the same UI", async () => {
    window.history.replaceState(
      {},
      "",
      "/admin/ai-ops?mfa_step_up=1&tab=advanced",
    );

    render(
      <GlobalStepUpBoundary>
        <div>AI console</div>
      </GlobalStepUpBoundary>,
    );

    expect(await screen.findByText("高权限安全验证")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/ai-ops");
    expect(window.location.search).toBe("?tab=advanced");
  });
});
