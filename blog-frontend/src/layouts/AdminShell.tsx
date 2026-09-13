import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Alert, IconButton } from "@gouno/ui/core";
import {
  AppShell,
  NavigationGroup,
  PageContainer,
  navigationItemClass,
} from "@gouno/ui/gouno";
import { ThemeToggle } from "@gouno/ui/theme";
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
import { MembershipStatus } from "../constants";

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
  const user = useUserProfile<BlogUserProfile>();
  const [siteName, setSiteName] = useState(
    () =>
      getCachedSiteSettings()?.site_title || DEFAULT_SITE_SETTINGS.site_title,
  );
  const [siteIcon, setSiteIcon] = useState(
    () =>
      getCachedSiteSettings()?.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url,
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    siteApi
      .getSiteSettings()
      .then((settings) => {
        setSiteName(settings.site_title || DEFAULT_SITE_SETTINGS.site_title);
        setSiteIcon(settings.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url);
      })
      .catch(() => {
        // Keep the administration shell available when public site settings fail.
      });

    const handleUpdate = (event: Event) => {
      const fresh = (event as CustomEvent).detail || getCachedSiteSettings();
      if (fresh?.site_title) setSiteName(fresh.site_title);
      setSiteIcon(fresh?.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SITE_SETTINGS_STORAGE_KEY && event.newValue) {
        try {
          const fresh = JSON.parse(event.newValue);
          if (fresh?.site_title) setSiteName(fresh.site_title);
          setSiteIcon(fresh?.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url);
        } catch {
          // Ignore malformed cross-tab settings and keep the current identity.
        }
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
    document.title = `${currentLabel(location.pathname)} - ${siteName} 后台`;
  }, [location.pathname, siteName]);

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
  const displayName =
    user?.principal?.display_name ||
    user?.name ||
    user?.preferred_username ||
    "U";

  return (
    <AppShell
      brand={
        <Link
          to="/admin/dashboard"
          className="inline-flex min-w-0 items-center gap-2 text-primary"
        >
          <img
            src={siteIcon}
            alt=""
            aria-hidden="true"
            className="size-6 shrink-0 object-contain"
          />
          <span className="truncate">{siteName}</span>
        </Link>
      }
      breadcrumbs={<span>{currentLabel(location.pathname)}</span>}
      navigationLabel="后台导航"
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
      toolbar={<ThemeToggle label="切换后台主题" />}
      footer={
        <div className="flex items-center gap-3 px-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-primary">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm">{displayName}</strong>
            <p className="text-xs text-muted-foreground">
              {getBlogRoleLabel(user?.role ? String(user.role) : undefined)}
            </p>
          </div>
          <IconButton
            className="shrink-0"
            variant="ghost"
            loading={loggingOut}
            onClick={() => void handleLogout()}
            label="退出登录"
            icon={<LogOut />}
          />
        </div>
      }
    >
      <PageContainer>
        {logoutError ? (
          <Alert
            type="error"
            showIcon
            title="退出登录失败"
            description={logoutError}
          />
        ) : null}
        {children}
      </PageContainer>
    </AppShell>
  );
}
