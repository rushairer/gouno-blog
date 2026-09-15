import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SudoGate } from "../SudoGate";
import * as mfaModule from "../../../mfa";

describe("SudoGate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the canonical locked privileged-access banner and keeps protected content hidden", async () => {
    const user = userEvent.setup();
    const openPopupSpy = vi
      .spyOn(mfaModule, "openStepUpPopup")
      .mockImplementation((_, onSuccess) => {
        onSuccess?.();
        return true;
      });

    render(
      <SudoGate
        title="受保护表单"
        description="修改受保护字段需要近期 MFA。"
        actionLabel="立即解锁"
      >
        <form>
          <input data-testid="secret-input" defaultValue="secret_val" />
        </form>
      </SudoGate>,
    );

    expect(screen.getByText("高权限操作需要身份验证")).toBeInTheDocument();
    expect(screen.getByText(/受保护表单/)).toBeInTheDocument();
    expect(
      screen.getByTestId("secret-input").closest(".hidden"),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "立即解锁" }));
    expect(openPopupSpy).toHaveBeenCalled();
  });

  it("renders one canonical unlocked status with countdown and explicit relock", async () => {
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));
    const user = userEvent.setup();

    render(
      <SudoGate
        title="成员与权限安全保护"
        description="修改 Blog 成员角色需要近期多因素身份认证。"
      >
        <div data-testid="member-directory">成员目录</div>
      </SudoGate>,
    );

    expect(screen.getByText("高权限操作已解锁")).toBeInTheDocument();
    expect(screen.getByText(/约 \d+ 分钟后会重新要求验证/)).toBeInTheDocument();
    expect(screen.getByTestId("member-directory")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新锁定" }));

    expect(screen.getByText("高权限操作需要身份验证")).toBeInTheDocument();
    expect(
      screen.getByTestId("member-directory").closest(".hidden"),
    ).not.toBeNull();
  });

  it("renders the Showcase expiring state while preserving the protected surface", () => {
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));

    render(
      <SudoGate
        title="模型连接与密钥保护"
        description="修改模型连接需要近期多因素身份认证。"
      >
        <div data-testid="provider-settings">模型连接</div>
      </SudoGate>,
    );

    act(() => {
      mfaModule.markSudoSessionStale();
    });

    expect(screen.getByText("近期 MFA 即将过期")).toBeInTheDocument();
    expect(
      screen.getByText(/下一次高权限写操作将触发 Step-Up/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("provider-settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新锁定" })).toBeInTheDocument();
  });
});
