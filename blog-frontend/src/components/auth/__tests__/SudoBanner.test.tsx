import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SudoBanner } from "../SudoBanner";
import * as mfaModule from "../../../mfa";

describe("SudoBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders inactive banner with activation button when Sudo is expired", async () => {
    const user = userEvent.setup();
    const openPopupSpy = vi.spyOn(mfaModule, "openStepUpPopup").mockImplementation((_, onSuccess) => {
      onSuccess?.();
      return true;
    });

    render(<SudoBanner />);

    expect(screen.getByText("高权限安全保护区域")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "立即激活 Sudo 提权" });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(openPopupSpy).toHaveBeenCalled();
  });

  it("renders active banner with remaining minutes when Sudo is active", () => {
    localStorage.setItem("gouno:sudo_activated_at", String(Date.now()));

    render(<SudoBanner />);

    expect(screen.getByText("Sudo 安全提权已激活")).toBeInTheDocument();
    expect(screen.getByText(/剩余有效时间约/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即激活 Sudo 提权" })).not.toBeInTheDocument();
  });
});
