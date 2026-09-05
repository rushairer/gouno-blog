import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Menu, Moon, Rss, Search, Sun, X } from "lucide-react";
import { Button, IconButton, Input } from "../components/ui";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  SITE_SETTINGS_STORAGE_KEY,
  SITE_SETTINGS_UPDATED_EVENT,
} from "../config/site-defaults";
import { pagesApi } from "../api/pages";
import { siteApi } from "../api/site";
import { publicNavigation } from "../utils/navigation";
import { STORAGE_KEYS } from "../constants";
import type { CustomPage, SiteSettings } from "../types/blog";
import { cn } from "../lib/utils";

export default function PublicShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState<SiteSettings | null>(() =>
    getCachedSiteSettings(),
  );
  const [navPages, setNavPages] = useState<CustomPage[]>([]);
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
      .then(setSite)
      .catch(() => {
        // Static brand defaults keep the public site usable during API outages.
      });
    pagesApi
      .getNavPages()
      .then(setNavPages)
      .catch(() => {
        // Graceful fallback to static nav
      });

    const handleUpdate = (event: Event) => {
      const fresh =
        (event as CustomEvent<SiteSettings>).detail || getCachedSiteSettings();
      if (fresh) setSite(fresh);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SITE_SETTINGS_STORAGE_KEY && event.newValue) {
        try {
          setSite(JSON.parse(event.newValue));
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

  const navItems = useMemo(() => {
    if (navPages.length === 0) {
      return publicNavigation;
    }
    const defaultItems = [
      { label: "文章", path: "/articles" },
      { label: "分类", path: "/categories" },
      { label: "归档", path: "/archive" },
    ];
    const customItems = navPages.map((p) => ({
      label: p.title,
      path: `/${p.slug}`,
    }));
    const seen = new Set<string>();
    const merged: Array<{ label: string; path: string }> = [];
    for (const item of [...defaultItems, ...customItems]) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        merged.push(item);
      }
    }
    return merged;
  }, [navPages]);

  return (
    <div className="public-shell min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="public-header sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="public-header__inner max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5 gap-4">
          {/* Logo / Title */}
          <Link
            className="wordmark text-lg font-bold tracking-tight text-foreground hover:text-primary transition-colors"
            to="/"
            aria-label={`${site?.site_title || DEFAULT_SITE_SETTINGS.site_title} 首页`}
          >
            {site?.site_title || DEFAULT_SITE_SETTINGS.site_title}
          </Link>

          {/* Desktop Nav */}
          <nav
            id="public-navigation"
            className={cn(
              "public-nav hidden md:flex items-center gap-6 text-sm font-medium",
              open &&
                "is-open !flex flex-col absolute top-full left-0 w-full bg-card border-b border-border p-6 shadow-xl gap-4 md:static md:w-auto md:bg-transparent md:p-0 md:border-0 md:shadow-none",
            )}
            aria-label="主导航"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "transition-colors hover:text-primary",
                    isActive
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )
                }
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            {open && (
              <form
                className="mobile-public-search flex w-full gap-2 pt-2 md:hidden"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = query.trim();
                  navigate(
                    next
                      ? `/search?q=${encodeURIComponent(next)}`
                      : "/articles",
                  );
                  setOpen(false);
                }}
              >
                <label className="sr-only" htmlFor="mobile-global-search">
                  搜索文章
                </label>
                <Input
                  id="mobile-global-search"
                  size="compact"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文章或主题"
                />
                <Button variant="secondary" size="sm" type="submit">
                  搜索
                </Button>
              </form>
            )}
          </nav>

          {/* Actions */}
          <div className="public-actions flex items-center gap-3">
            <Link
              className="public-admin-link hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary transition-colors"
              to="/admin"
              aria-label="进入内容后台"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>后台</span>
            </Link>

            <form
              className="header-search hidden sm:flex items-center relative"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                if (query.trim())
                  navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              <label className="sr-only" htmlFor="global-search">
                搜索文章
              </label>
              <Input
                id="global-search"
                size="compact"
                className="h-8 w-36 lg:w-48 pl-8 pr-2 text-xs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
              />
              <IconButton
                type="submit"
                label="提交搜索"
                icon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
                variant="ghost"
                size="sm"
                className="absolute left-1"
              />
            </form>

            <IconButton
              className="bare-icon theme-toggle text-muted-foreground hover:text-foreground"
              label="切换主题"
              icon={
                theme === "light" ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )
              }
              variant="ghost"
              size="sm"
              onClick={() =>
                setTheme((current) => (current === "light" ? "dark" : "light"))
              }
              aria-pressed={theme === "dark"}
            />
            <IconButton
              className="bare-icon menu-toggle md:hidden text-muted-foreground hover:text-foreground"
              label={open ? "关闭导航" : "打开导航"}
              icon={
                open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />
              }
              variant="ghost"
              size="sm"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="public-navigation"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 md:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="public-footer border-t border-border/60 bg-card/40 py-12 text-sm text-muted-foreground">
        <div className="public-footer__inner max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-8">
          <div className="space-y-2 max-w-md">
            <Link
              className="wordmark text-base font-bold text-foreground"
              to="/"
            >
              {site?.site_title || DEFAULT_SITE_SETTINGS.site_title}
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {site?.site_description || DEFAULT_SITE_SETTINGS.site_description}
            </p>
          </div>
          <div className="footer-nav flex flex-wrap gap-6 text-xs font-medium">
            <Link
              to="/articles"
              className="hover:text-foreground transition-colors"
            >
              文章
            </Link>
            <Link
              to="/archive"
              className="hover:text-foreground transition-colors"
            >
              归档
            </Link>
            {navPages.length > 0 ? (
              navPages.map((p) => (
                <Link
                  key={p.id}
                  to={`/${p.slug}`}
                  className="hover:text-foreground transition-colors"
                >
                  {p.title}
                </Link>
              ))
            ) : (
              <Link
                to="/about"
                className="hover:text-foreground transition-colors"
              >
                关于
              </Link>
            )}
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> 管理后台
            </Link>
            <a
              href={site?.rss_url || "/feed.xml"}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Rss className="h-3.5 w-3.5" /> RSS
            </a>
            {site?.github_url ? (
              <a
                href={site.github_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            ) : null}
          </div>
        </div>
        <div className="footer-meta max-w-6xl mx-auto px-6 pt-8 mt-8 border-t border-border/40 text-xs text-muted-foreground text-center md:text-left">
          {(() => {
            const metaText =
              site?.footer_text !== undefined
                ? site.footer_text
                : DEFAULT_SITE_SETTINGS.footer_text;
            const siteTitle =
              site?.site_title || DEFAULT_SITE_SETTINGS.site_title;
            const currentYear = new Date().getFullYear();
            if (!metaText) {
              return `© ${currentYear} ${siteTitle}`;
            }
            if (metaText.startsWith("©")) {
              return metaText.replace("{year}", String(currentYear));
            }
            return `© ${currentYear} ${siteTitle}. ${metaText}`;
          })()}
        </div>
      </footer>
    </div>
  );
}
