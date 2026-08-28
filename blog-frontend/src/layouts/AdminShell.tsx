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
} from "lucide-react";
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

import {
  STORAGE_KEYS,
  PAGINATION_LIMITS,
  MembershipStatus,
} from "../constants";

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
    localStorage.getItem(STORAGE_KEYS.THEME) === "dark" ? "dark" : "light",
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
    <div className={`admin-shell ${mobileOpen ? "admin-nav-open" : ""}`}>
      <aside className="admin-sidebar" id="admin-sidebar">
        <Link className="wordmark admin-wordmark" to="/admin/dashboard">
          {siteName}
        </Link>
        <nav aria-label="后台导航">
          {filteredNav.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="admin-profile">
          <span className="admin-avatar">
            {(
              user?.principal?.display_name ||
              user?.name ||
              user?.preferred_username ||
              "U"
            )
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <strong>
              {user?.principal?.display_name ||
                user?.name ||
                user?.preferred_username ||
                "成员"}
            </strong>
            <small>{getBlogRoleLabel(user?.roles?.[0])}</small>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="bare-icon admin-menu"
            type="button"
            aria-label="切换后台导航"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <Link to="/admin/dashboard">后台</Link>
            <span>/</span>
            <strong>{currentLabel(location.pathname)}</strong>
          </div>
          <form className="admin-search" role="search" onSubmit={submitSearch}>
            <button type="submit" aria-label="提交文章搜索">
              <Search />
            </button>
            <input
              className="admin-search__input"
              aria-label="搜索文章"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索文章标题、摘要或正文…"
            />
          </form>
          <div className="admin-topbar-actions">
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              aria-label="在新窗口查看前台站点"
            >
              <ExternalLink />
              <span>查看站点</span>
            </Link>
            <Link
              to="/admin/notifications"
              className="admin-topbar-notifications"
              aria-label="查看通知中心"
            >
              <span className="admin-topbar-notifications__icon">
                <Bell />
                {unreadCount > 0 ? (
                  <span className="admin-topbar-notifications__badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </span>
              <span>通知</span>
            </Link>
            <button
              className="admin-theme-toggle"
              type="button"
              onClick={() =>
                setTheme((current) => (current === "light" ? "dark" : "light"))
              }
              aria-label="切换后台主题"
              aria-pressed={theme === "dark"}
            >
              {theme === "light" ? <Moon /> : <Sun />}
              <span>{theme === "light" ? "深色模式" : "浅色模式"}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label="退出登录"
            >
              <LogOut />
              <span>{loggingOut ? "正在退出…" : "退出登录"}</span>
            </button>
          </div>
        </header>
        {logoutError ? (
          <p className="admin-logout-error" role="alert">
            {logoutError}
          </p>
        ) : null}
        <main className="admin-content">{children}</main>
      </div>
      {mobileOpen ? (
        <button
          className="admin-nav-scrim"
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭后台导航"
        />
      ) : null}
    </div>
  );
}
