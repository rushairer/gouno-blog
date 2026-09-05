import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminShell from "../AdminShell";
import AdminUsers from "../../pages/admin/Users";
import { ToastProvider } from "@gouno/ui";

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

describe("AdminShell navigation utilities", () => {
  beforeEach(() => {
    logoutMock.mockClear();
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

  it("uses configured site identity and shared topbar action primitives", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <h1>Dashboard</h1>
        </AdminShell>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("link", { name: "Configured Site" }),
    ).toBeInTheDocument();

    const frontsiteLink = screen.getByRole("link", {
      name: "在新窗口查看前台站点",
    });
    expect(frontsiteLink).toHaveAttribute("href", "/");
    expect(frontsiteLink).toHaveClass("btn", "btn-ghost", "btn--compact");

    const notificationsLink = screen.getByRole("link", {
      name: "查看通知中心",
    });
    expect(notificationsLink).toHaveAttribute("href", "/admin/notifications");
    expect(notificationsLink).toHaveClass("btn", "btn-ghost", "btn--compact");

    const logoutButton = screen.getByRole("button", { name: "退出登录" });
    expect(logoutButton).toHaveClass("btn", "btn-ghost", "btn--compact");
    fireEvent.click(logoutButton);
    expect(logoutMock).toHaveBeenCalledOnce();

    expect(screen.getByRole("search")).toHaveClass("hidden", "lg:flex");
    expect(frontsiteLink.parentElement).toHaveClass("hidden", "sm:inline-flex");
  });

  it("opens the shared navigation sheet and closes it after route selection", () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <h1>Dashboard</h1>
        </AdminShell>
      </MemoryRouter>,
    );

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

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <h1>Dashboard</h1>
        </AdminShell>
      </MemoryRouter>,
    );

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
        <ToastProvider>
          <AdminUsers />
        </ToastProvider>
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
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <LocationProbe />
        </AdminShell>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "搜索文章" }), {
      target: { value: "系统 架构" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交文章搜索" }));
    expect(screen.getByLabelText("current location")).toHaveTextContent(
      "/admin/posts?q=%E7%B3%BB%E7%BB%9F%20%E6%9E%B6%E6%9E%84",
    );
  });

  it("defaults administration to the shared dark surface theme", () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <h1>Dashboard</h1>
        </AdminShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "切换后台主题" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("gouno-blog:theme")).toBe("dark");
  });

  it("restores and toggles the shared site theme from administration", () => {
    localStorage.setItem("gouno-blog:theme", "dark");
    document.documentElement.dataset.theme = "dark";

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminShell>
          <h1>Dashboard</h1>
        </AdminShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "切换后台主题" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("gouno-blog:theme")).toBe("dark");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("gouno-blog:theme")).toBe("light");
  });
});
