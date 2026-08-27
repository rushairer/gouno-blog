import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Menu, Moon, Rss, Search, Sun, X } from "lucide-react";
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
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header__inner">
          <Link
            className="wordmark"
            to="/"
            aria-label={`${site?.site_title || DEFAULT_SITE_SETTINGS.site_title} 首页`}
          >
            {site?.site_title || DEFAULT_SITE_SETTINGS.site_title}
          </Link>
          <nav
            id="public-navigation"
            className={`public-nav ${open ? "is-open" : ""}`}
            aria-label="主导航"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <form
              className="mobile-public-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const next = query.trim();
                navigate(
                  next ? `/search?q=${encodeURIComponent(next)}` : "/articles",
                );
                setOpen(false);
              }}
            >
              <label className="sr-only" htmlFor="mobile-global-search">
                搜索文章
              </label>
              <Search />
              <input
                id="mobile-global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索文章或主题"
              />
              <button type="submit">搜索</button>
            </form>
          </nav>
          <div className="public-actions">
            <Link
              className="public-admin-link"
              to="/admin"
              aria-label="进入内容后台"
            >
              <LayoutDashboard />
              <span>后台</span>
            </Link>
            <form
              className="header-search"
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
              <input
                id="global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
              />
              <button type="submit" aria-label="提交搜索">
                <Search />
              </button>
            </form>
            <button
              className="bare-icon theme-toggle"
              type="button"
              onClick={() =>
                setTheme((current) => (current === "light" ? "dark" : "light"))
              }
              aria-label="切换主题"
              aria-pressed={theme === "dark"}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <button
              className="bare-icon menu-toggle"
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? "关闭导航" : "打开导航"}
              aria-expanded={open}
              aria-controls="public-navigation"
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="public-footer">
        <div className="public-footer__inner">
          <div>
            <Link className="wordmark" to="/">
              {site?.site_title || DEFAULT_SITE_SETTINGS.site_title}
            </Link>
            <p>
              {site?.site_description || DEFAULT_SITE_SETTINGS.site_description}
            </p>
          </div>
          <div className="footer-nav">
            <Link to="/articles">文章</Link>
            <Link to="/archive">归档</Link>
            {navPages.length > 0 ? (
              navPages.map((p) => (
                <Link key={p.id} to={`/${p.slug}`}>
                  {p.title}
                </Link>
              ))
            ) : (
              <Link to="/about">关于</Link>
            )}
            <Link to="/admin">
              <LayoutDashboard /> 管理后台
            </Link>
            <a href={site?.rss_url || "/feed.xml"}>
              <Rss /> RSS
            </a>
            {site?.github_url ? (
              <a href={site.github_url} target="_blank" rel="noreferrer">
                GitHub
              </a>
            ) : null}
          </div>
        </div>
        <div className="footer-meta">
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
