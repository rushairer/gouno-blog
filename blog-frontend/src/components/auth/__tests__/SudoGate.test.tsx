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

  it("renders locked overlay when Sudo is not active", async () => {
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
        description="需要验证"
        actionLabel="立即解锁"
      >
        <form>
          <input data-testid="secret-input" defaultValue="secret_val" />
        </form>
      </SudoGate>,
    );

    expect(screen.getByText("受保护表单")).toBeInTheDocument();
    expect(screen.getByText("需要验证")).toBeInTheDocument();
    const unlockBtn = screen.getByRole("button", { name: "立即解锁" });
    expect(unlockBtn).toBeInTheDocument();

    await user.click(unlockBtn);
    expect(openPopupSpy).toHaveBeenCalled();
  });

  it("renders unlocked content with status badge when Sudo is active", () => {
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));

    render(
      <SudoGate>
        <div data-testid="unlocked-content">可编辑的内容</div>
      </SudoGate>,
    );

    expect(screen.getByTestId("unlocked-content")).toBeInTheDocument();
    expect(screen.getByText(/Sudo 已解锁/)).toBeInTheDocument();
    expect(screen.queryByText("高权限安全保护区域")).not.toBeInTheDocument();
  });
});
