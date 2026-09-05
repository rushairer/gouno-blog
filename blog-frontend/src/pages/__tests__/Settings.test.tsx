import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import Settings from "../Settings";

const { getGossoAdminURLMock } = vi.hoisted(() => ({
  getGossoAdminURLMock: vi.fn(),
}));

vi.mock("../../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth")>();
  return {
    ...actual,
    getGossoAdminURL: getGossoAdminURLMock,
    useSafeUserProfile: () => ({ sub: "reader" }),
  };
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <Settings />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => {
    getGossoAdminURLMock.mockReset();
  });

  it("links account security to the configured identity center", () => {
    getGossoAdminURLMock.mockReturnValue(
      "https://sso.dev.local/account-settings",
    );

    renderSettings();

    expect(
      screen.getByRole("link", { name: /打开 GOSSO Admin/i }),
    ).toHaveAttribute("href", "https://sso.dev.local/account-settings");
  });

  it("shows a shared error state when no identity-center URL is available", () => {
    getGossoAdminURLMock.mockReturnValue("");

    renderSettings();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /未提供身份管理中心地址/,
    );
  });
});
