import { render, screen } from "@testing-library/react";
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

  it(
    "renders the canonical locked privileged-access banner and keeps protected content hidden",
    async () => {
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

      expect(
        screen.getByText("高权限操作需要身份验证"),
      ).toBeInTheDocument();
      expect(screen.getByText(/受保护表单/)).toBeInTheDocument();
      expect(
        screen.getByTestId("secret-input").closest(".hidden"),
      ).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "立即解锁" }));
      expect(openPopupSpy).toHaveBeenCalled();
    },
  );

  it(
    "renders one canonical unlocked status with countdown and explicit relock",
    async () => {
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
      expect(
        screen.getByText(/约 \d+ 分钟后会重新要求验证/),
      ).toBeInTheDocument();
      expect(screen.getByTestId("member-directory")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "重新锁定" }));

      expect(
        screen.getByText("高权限操作需要身份验证"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("member-directory").closest(".hidden"),
      ).not.toBeNull();
    },
  );

  it("ignores the legacy presentation selector so pages cannot diverge visually", () => {
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));

    render(
      <SudoGate unlockedPresentation="compact">
        <div>可编辑的内容</div>
      </SudoGate>,
    );

    expect(screen.getByText("高权限操作已解锁")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新锁定" })).toBeInTheDocument();
    expect(screen.queryByText(/Sudo 已解锁/)).not.toBeInTheDocument();
  });
});
