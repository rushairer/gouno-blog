import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
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

  it("uses configured site identity and canonical topbar action semantics", async () => {
    const { container } = renderAdminShell(<h1>Dashboard</h1>);

    expect(
      await screen.findByRole("link", { name: "Configured Site" }),
    ).toBeInTheDocument();

    const pageContainer = container.querySelector('[data-slot="page-container"]');
    expect(pageContainer).toContainElement(
      screen.getByRole("heading", { name: "Dashboard" }),
    );

    const frontsiteLink = screen.getByRole("link", {
      name: "在新窗口查看前台站点",
    });
    expect(frontsiteLink).toHaveAttribute("href", "/");
    expect(frontsiteLink).toHaveAttribute("target", "_blank");
    expect(frontsiteLink).toHaveAttribute("rel", "noreferrer");

    const notificationsLink = screen.getByRole("link", {
      name: "查看通知中心",
    });
    expect(notificationsLink).toHaveAttribute("href", "/admin/notifications");

    const logoutButton = screen.getByRole("button", { name: "退出登录" });
    fireEvent.click(logoutButton);
    expect(logoutMock).toHaveBeenCalledOnce();

    expect(screen.getByRole("search")).toHaveClass("hidden", "lg:flex");
    expect(frontsiteLink.parentElement).toHaveClass("hidden", "sm:inline-flex");
  });

  it("opens the canonical navigation sheet and closes it after route selection", () => {
    renderAdminShell(<h1>Dashboard</h1>);

    fireEvent.click(screen.getByRole("button", { name: "后台导航" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "文章" })).toBeVisible();
    fireEvent.click(within(sheet).getByRole("link", { name: "文章" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters navigation from the existing permission list", () => {
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

  it("submits the top search to the article management URL", () => {
    function LocationProbe() {
      const location = useLocation();
      return (
        <output aria-label="current location">
          {location.pathname}
          {location.search}
        </output>
      );
    }

    renderAdminShell(<LocationProbe />);

    fireEvent.change(screen.getByRole("textbox", { name: "搜索文章" }), {
      target: { value: "系统 架构" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交文章搜索" }));
    expect(screen.getByLabelText("current location")).toHaveTextContent(
      "/admin/posts?q=%E7%B3%BB%E7%BB%9F%20%E6%9E%B6%E6%9E%84",
    );
  });

  it("keeps the first-visit dark default as Blog product policy", async () => {
    renderAdminShell(<h1>Dashboard</h1>);

    await waitFor(() =>
      expect(localStorage.getItem("gouno-blog:theme")).toBe("dark"),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      screen.getByRole("button", { name: "切换后台主题" }),
    ).toHaveAttribute("aria-pressed", "true");
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
