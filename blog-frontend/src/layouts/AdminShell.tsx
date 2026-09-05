import { useEffect, useLayoutEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ExternalLink,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { Button, ButtonLink, IconButton } from "../components/ui";
import { notificationsApi } from "../api/notifications";
import { useUserProfile } from "@gosso/client/react";
import { type BlogUserProfile, getBlogRoleLabel, logout } from "../auth";

import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  SITE_SETTINGS_STORAGE_KEY,
  SITE_SETTINGS_UPDATED_EVENT,
} from "../config/site-defaults";
import { siteApi } from "../api/site";
import {
  adminNavigation,
  getFilteredAdminNavigation,
} from "../utils/navigation";
import {
  STORAGE_KEYS,
  PAGINATION_LIMITS,
  MembershipStatus,
} from "../constants";
import { cn } from "../lib/utils";

function currentLabel(pathname: string) {
  if (pathname === "/admin/posts/new") return "新建文章";
  if (/^\/admin\/posts\/[^/]+\/edit$/.test(pathname)) return "编辑文章";
  if (pathname === "/admin/pages/new") return "新建单页";
  if (/^\/admin\/pages\/[^/]+\/edit$/.test(pathname)) return "编辑单页";
  return (
    adminNavigation
      .flatMap((group) => group.items)
      .find((item) => pathname.startsWith(item.path))?.label || "管理后台"
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUserProfile<BlogUserProfile>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState(() =>
    location.pathname === "/admin/posts"
      ? new URLSearchParams(location.search).get("q") || ""
      : "",
  );
  const [siteName, setSiteName] = useState(
    () =>
      getCachedSiteSettings()?.site_title || DEFAULT_SITE_SETTINGS.site_title,
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem(STORAGE_KEYS.THEME) === "light" ? "light" : "dark",
  );

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  useEffect(() => {
    siteApi
      .getSiteSettings()
      .then((settings) =>
        setSiteName(settings.site_title || DEFAULT_SITE_SETTINGS.site_title),
      )
      .catch(() => {
        // Keep the administration shell available when public site settings fail.
      });

    const handleUpdate = (event: Event) => {
      const fresh = (event as CustomEvent).detail || getCachedSiteSettings();
      if (fresh?.site_title) setSiteName(fresh.site_title);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SITE_SETTINGS_STORAGE_KEY && event.newValue) {
        try {
          const fresh = JSON.parse(event.newValue);
          if (fresh?.site_title) setSiteName(fresh.site_title);
        } catch {}
      }
    };

    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const label = currentLabel(location.pathname);
    const prefix = unreadCount > 0 ? `(${unreadCount}) ` : "";
    document.title = `${prefix}${label} - ${siteName} 后台`;
  }, [location.pathname, siteName, unreadCount]);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { list } = await notificationsApi.getNotifications({
          pageSize: PAGINATION_LIMITS.RUNS_PAGE_SIZE,
        });
        setUnreadCount(list.filter((item) => !item.read_at).length);
      } catch {
        // Keep shell resilient
      }
    };
    void fetchUnread();
    const handleChanged = () => {
      void fetchUnread();
    };
    window.addEventListener("community:notifications-changed", handleChanged);
    return () => {
      window.removeEventListener(
        "community:notifications-changed",
        handleChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (location.pathname === "/admin/posts") {
      setSearch(new URLSearchParams(location.search).get("q") || "");
    }
  }, [location.pathname, location.search]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(
      query ? `/admin/posts?q=${encodeURIComponent(query)}` : "/admin/posts",
    );
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
    } catch (reason) {
      setLogoutError(
        reason instanceof Error ? reason.message : "退出登录失败，请重试。",
      );
      setLoggingOut(false);
    }
  };

  const hasPerm = (perm: string) => {
    if (
      !user ||
      (user.membership_status &&
        user.membership_status !== MembershipStatus.ACTIVE)
    ) {
      return false;
    }
    return user.permissions?.includes(perm) ?? false;
  };

  const filteredNav = getFilteredAdminNavigation(hasPerm);

  return (
    <div
      className={cn(
        "admin-shell grid min-h-screen w-full lg:grid-cols-[250px_1fr] bg-background text-foreground",
        mobileOpen && "admin-nav-open",
      )}
    >
      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        className={cn(
          "admin-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-[#11161d] p-4 transition-transform lg:static lg:flex lg:w-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/60">
          <Link
            className="wordmark admin-wordmark text-lg font-bold tracking-tight text-foreground"
            to="/admin/dashboard"
          >
            {siteName}
          </Link>
          <IconButton
            className="lg:hidden"
            label="关闭后台导航"
            icon={<X className="h-5 w-5" />}
            variant="ghost"
            size="sm"
            onClick={() => setMobileOpen(false)}
          />
        </div>

        <nav
          aria-label="后台导航"
          className="flex-1 space-y-6 overflow-y-auto py-2"
        >
          {filteredNav.map((group) => (
            <section className="admin-nav-group space-y-1" key={group.label}>
              <h2 className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </h2>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )
                    }
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        {/* Profile Card */}
        <div className="admin-profile flex items-center gap-3 rounded-lg border border-border bg-card p-3 pt-3 mt-4 border-t border-border/60">
          <span className="admin-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary font-bold text-xs">
            {(
              user?.principal?.display_name ||
              user?.name ||
              user?.preferred_username ||
              "U"
            )
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-xs font-semibold text-foreground">
              {user?.principal?.display_name ||
                user?.name ||
                user?.preferred_username ||
                "成员"}
            </strong>
            <small className="block truncate text-[11px] text-muted-foreground">
              {getBlogRoleLabel(user?.roles?.[0])}
            </small>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="admin-main flex min-w-0 flex-col">
        {/* Topbar */}
        <header className="admin-topbar sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-[#121720]/90 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <IconButton
              className="bare-icon admin-menu lg:hidden"
              label="切换后台导航"
              icon={<Menu className="h-5 w-5" />}
              variant="ghost"
              size="sm"
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
              onClick={() => setMobileOpen(!mobileOpen)}
            />
            <div className="breadcrumb flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Link
                to="/admin/dashboard"
                className="hover:text-foreground transition-colors"
              >
                后台
              </Link>
              <span>/</span>
              <strong className="text-foreground">
                {currentLabel(location.pathname)}
              </strong>
            </div>
          </div>

          <form
            className="admin-search hidden md:flex items-center relative max-w-sm flex-1 mx-4"
            role="search"
            onSubmit={submitSearch}
          >
            <IconButton
              type="submit"
              label="提交文章搜索"
              icon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
              variant="ghost"
              size="sm"
              className="absolute left-1"
            />
            <input
              className="admin-search__input flex h-8 w-full rounded-md border border-border bg-input pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              aria-label="搜索文章"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索文章标题、摘要或正文…"
            />
          </form>

          <div className="admin-topbar-actions flex items-center gap-2">
            <ButtonLink
              to="/"
              target="_blank"
              rel="noreferrer"
              aria-label="在新窗口查看前台站点"
              variant="ghost"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
            >
              <span className="hidden sm:inline">查看站点</span>
            </ButtonLink>
            <ButtonLink
              to="/admin/notifications"
              className="admin-topbar-notifications"
              aria-label="查看通知中心"
              variant="ghost"
              size="sm"
              icon={
                <span className="admin-topbar-notifications__icon relative inline-flex">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="admin-topbar-notifications__badge absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </span>
              }
            >
              <span className="hidden sm:inline">通知</span>
            </ButtonLink>
            <Button
              variant="ghost"
              size="sm"
              className="admin-theme-toggle"
              onClick={() =>
                setTheme((current) => (current === "light" ? "dark" : "light"))
              }
              aria-label="切换后台主题"
              aria-pressed={theme === "dark"}
              icon={
                theme === "light" ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )
              }
            >
              <span className="hidden sm:inline">
                {theme === "light" ? "深色" : "浅色"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="admin-topbar-logout"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label="退出登录"
              icon={<LogOut className="h-4 w-4" />}
            >
              <span className="hidden sm:inline">
                {loggingOut ? "正在退出…" : "退出登录"}
              </span>
            </Button>
          </div>
        </header>

        {logoutError ? (
          <p
            className="admin-logout-error p-4 bg-destructive/15 text-destructive text-sm font-medium border-b border-destructive/30"
            role="alert"
          >
            {logoutError}
          </p>
        ) : null}

        <main className="admin-content flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div
          className="admin-nav-scrim fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
    </div>
  );
}
