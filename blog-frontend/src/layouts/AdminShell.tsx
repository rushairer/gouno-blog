import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, ExternalLink, LogOut, Search } from "lucide-react";
import { Button, ButtonLink, IconButton } from "@gouno/ui";
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
import { PAGINATION_LIMITS, MembershipStatus } from "../constants";
import {
  AdminShell as SharedAdminShell,
  NavigationGroup,
  navigationItemClass,
  ThemeToggle,
  SearchField,
  Feedback,
} from "@gouno/ui";

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
    <SharedAdminShell
      brand={<Link to="/admin/dashboard">{siteName}</Link>}
      breadcrumbs={<span>{currentLabel(location.pathname)}</span>}
      navigation={(close) =>
        filteredNav.map((group) => (
          <NavigationGroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={navigationItemClass}
                onClick={close}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </NavigationGroup>
        ))
      }
      toolbar={
        <>
          <form
            role="search"
            onSubmit={submitSearch}
            className="flex items-center gap-1"
          >
            <SearchField
              aria-label="搜索文章"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索文章…"
            />
            <IconButton type="submit" label="提交文章搜索" icon={<Search />} />
          </form>
          <ButtonLink
            to="/"
            target="_blank"
            rel="noreferrer"
            aria-label="在新窗口查看前台站点"
            variant="ghost"
            size="icon"
            icon={<ExternalLink />}
          />
          <ButtonLink
            to="/admin/notifications"
            aria-label="查看通知中心"
            variant="ghost"
            icon={<Bell />}
          >
            {unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : null}
          </ButtonLink>
          <ThemeToggle label="切换后台主题" />
        </>
      }
      account={
        <Button
          variant="ghost"
          size="icon"
          loading={loggingOut}
          onClick={() => void handleLogout()}
          aria-label="退出登录"
          icon={<LogOut />}
        />
      }
      footer={
        <div className="flex items-center gap-3 px-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-primary">
            {(
              user?.principal?.display_name ||
              user?.name ||
              user?.preferred_username ||
              "U"
            )
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-sm">
              {user?.principal?.display_name ||
                user?.name ||
                user?.preferred_username}
            </strong>
            <p className="text-xs text-muted-foreground">
              {getBlogRoleLabel(user?.role ? String(user.role) : undefined)}
            </p>
          </div>
        </div>
      }
    >
      {logoutError ? <Feedback type="error">{logoutError}</Feedback> : null}
      {children}
    </SharedAdminShell>
  );
}
