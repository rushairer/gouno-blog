import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/ui";
import AdminSiteSettings from "../SiteSettings";
import { siteApi } from "../../../api/site";

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    isMfaError: (err: unknown) => {
      const msg = String((err as any)?.message || "");
      return msg.includes("recent multi-factor") || msg.includes("mfa");
    },
    stepUpMfa: vi.fn(),
    gossoAdminURL: "https://auth.example.com",
    getGossoAdminURL: () => "https://auth.example.com",
    useSafeUserProfile: () => ({
      principal: { issuer: "https://auth.example.com" },
    }),
  };
});

vi.mock("../../../api/site", () => ({
  siteApi: {
    getAdminSettings: vi.fn(),
    updateAdminSettings: vi.fn(),
  },
}));

describe("AdminSiteSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(siteApi.getAdminSettings).mockResolvedValue({
      site_title: "测试博客",
      site_description: "这是测试描述",
      rss_url: "/feed.xml",
      favicon_url: "/favicon.svg",
      hero_title: "欢迎阅读",
      hero_description: "技术博客",
    } as any);
  });

  it("loads and displays site settings", async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminSiteSettings />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("测试博客")).toBeInTheDocument();
    expect(screen.getByDisplayValue("这是测试描述")).toBeInTheDocument();
  });

  it("triggers StepUpMfaModal when update fails with MFA required, and preserves draft", async () => {
    vi.mocked(siteApi.updateAdminSettings).mockRejectedValue(
      new Error("recent multi-factor authentication required"),
    );

    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminSiteSettings />
        </ToastProvider>
      </MemoryRouter>,
    );

    const input = await screen.findByDisplayValue("测试博客");
    await userEvent.clear(input);
    await userEvent.type(input, "新博客名称");

    const saveButtons = screen.getAllByRole("button", { name: /保存设置/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("高权限安全验证")).toBeInTheDocument();
      expect(screen.getByText("需要进行二次身份验证")).toBeInTheDocument();
    });

    // Draft should be saved in sessionStorage
    const savedPending = sessionStorage.getItem(
      "gouno-blog:pending_site_settings",
    );
    expect(savedPending).not.toBeNull();
    expect(JSON.parse(savedPending!).site_title).toBe("新博客名称");

    // Should NOT show raw error text on screen
    expect(
      screen.queryByText(/recent multi-factor authentication required/i),
    ).not.toBeInTheDocument();
  });

  it("restores unsaved draft from sessionStorage with warning notification", async () => {
    sessionStorage.setItem(
      "gouno-blog:pending_site_settings",
      JSON.stringify({ site_title: "暂存的草稿标题" }),
    );

    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminSiteSettings />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("暂存的草稿标题")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "已恢复未保存的修改内容。当前尚未生效，请点击“保存设置”以提交生效。",
      ),
    ).toBeInTheDocument();
  });
});
