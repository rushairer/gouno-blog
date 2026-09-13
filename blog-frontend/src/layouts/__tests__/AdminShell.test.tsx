import { fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationProvider } from "@gouno/ui/core";
import { ThemeProvider } from "@gouno/ui/theme";

import AdminShell from "../AdminShell";
import AdminUsers from "../../pages/admin/Users";
import { AppFeedbackProvider } from "../../components/feedback/AppFeedbackProvider";

const { logoutMock, userProfileMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  userProfileMock: vi.fn(),
}));

vi.mock("@gosso/client/react", () => ({
  useUserProfile: userProfileMock,
  useSession: () => ({
    profile: { name: "Content Admin", email: "admin@example.com" },
    loggedIn: true,
    isAdmin: true,
  }),
  GossoProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../auth", () => ({
  getUserProfile: () => ({ name: "Content Admin", email: "admin@example.com" }),
  gossoClient: {
    getUserProfile: () => ({
      name: "Content Admin",
      email: "admin@example.com",
    }),
  },
  gossoAdminURL: "https://sso.io84.com",
  getGossoAdminURL: () => "https://sso.io84.com",
  useSafeUserProfile: () => ({
    name: "Content Admin",
    email: "admin@example.com",
  }),
  logout: logoutMock,
  getCachedBlogSession: () => null,
  hasBlogPermission: () => true,
  hasAnyBlogPermission: () => true,
  getBlogRoleLabel: () => "管理员",
  apiFetch: () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: { list: [] } }),
    }),
}));

vi.mock("../../api/site", () => ({
  siteApi: {
    getSiteSettings: () => Promise.resolve({ site_title: "Configured Site" }),
  },
}));

function renderAdminShell(
  children: React.ReactNode,
  initialEntries = ["/admin/dashboard"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider brand="blog-admin" storageKey="gouno-blog:theme">
        <NavigationProvider link={Link}>
          <AdminShell>{children}</AdminShell>
        </NavigationProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("AdminShell navigation utilities", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    userProfileMock.mockReturnValue({
      name: "Content Admin",
      email: "admin@example.com",
      permissions: [
        "content.author",
        "content.manage",
        "community.moderate",
        "ai.manage",
        "site.manage",
        "members.manage",
      ],
    });
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("uses the Showcase shell chrome while preserving real product identity and logout", async () => {
    const { container } = renderAdminShell(<h1>Dashboard</h1>);

    const brand = await screen.findByRole("link", { name: "Configured Site" });
    expect(brand).toBeInTheDocument();
    expect(brand).toHaveClass("inline-flex", "items-center", "gap-2");
    expect(brand.querySelector('img[src="/favicon.svg"]')).toBeInTheDocument();

    const pageContainer = container.querySelector(
      '[data-slot="page-container"]',
    );
    expect(pageContainer).toContainElement(
      screen.getByRole("heading", { name: "Dashboard" }),
    );

    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "在新窗口查看前台站点" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "查看通知中心" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "切换后台主题" }),
    ).toBeInTheDocument();

    const logoutButton = screen.getByRole("button", { name: "退出登录" });
    fireEvent.click(logoutButton);
    expect(logoutMock).toHaveBeenCalledOnce();

    const desktopNavigation = container.querySelector("aside nav");
    expect(desktopNavigation).not.toBeNull();
    expect(
      within(desktopNavigation as HTMLElement).getByRole("heading", {
        name: "Content 内容管理",
      }),
    ).toBeInTheDocument();
    expect(
      within(desktopNavigation as HTMLElement).getByRole("heading", {
        name: "AI Automation AI 运营",
      }),
    ).toBeInTheDocument();
    expect(
      within(desktopNavigation as HTMLElement).getByRole("heading", {
        name: "Site 站点管理",
      }),
    ).toBeInTheDocument();
  });

  it("opens the canonical navigation sheet and closes it after route selection", () => {
    renderAdminShell(<h1>Dashboard</h1>);

    fireEvent.click(screen.getByRole("button", { name: "后台导航" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "文章" })).toBeVisible();
    fireEvent.click(within(sheet).getByRole("link", { name: "文章" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters the Showcase navigation structure from the existing permission list", () => {
    userProfileMock.mockReturnValue({
      name: "Moderator",
      permissions: ["community.moderate"],
    });

    renderAdminShell(<h1>Dashboard</h1>);

    expect(screen.getByRole("link", { name: "评论" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "文章" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "成员与权限" }),
    ).not.toBeInTheDocument();
  });

  it("points the identity management action at the gateway route", () => {
    render(
      <MemoryRouter>
        <AppFeedbackProvider>
          <AdminUsers />
        </AppFeedbackProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /前往 GOSSO 管理/ }),
    ).toHaveAttribute("href", "https://sso.io84.com");
    expect(screen.getByText("成员与权限")).toBeInTheDocument();
  });

  it("keeps the shared ThemeProvider system default instead of forcing legacy dark mode", () => {
    renderAdminShell(<h1>Dashboard</h1>);

    expect(localStorage.getItem("gouno-blog:theme")).toBeNull();
    expect(
      screen.getByRole("button", { name: "切换后台主题" }),
    ).toBeInTheDocument();
  });

  it("restores an explicit shared light preference without overriding it", () => {
    localStorage.setItem("gouno-blog:theme", "light");
    document.documentElement.dataset.theme = "light";

    renderAdminShell(<h1>Dashboard</h1>);

    expect(localStorage.getItem("gouno-blog:theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(
      screen.getByRole("button", { name: "切换后台主题" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("honors an explicitly persisted system preference", () => {
    localStorage.setItem("gouno-blog:theme", "system");

    renderAdminShell(<h1>Dashboard</h1>);

    expect(localStorage.getItem("gouno-blog:theme")).toBe("system");
  });
});
