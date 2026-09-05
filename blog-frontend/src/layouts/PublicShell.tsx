import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Menu, Rss, Search } from "lucide-react";
import { IconButton, Input, ThemeToggle, Drawer } from "@gouno/ui";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  SITE_SETTINGS_STORAGE_KEY,
  SITE_SETTINGS_UPDATED_EVENT,
} from "../config/site-defaults";
import { pagesApi } from "../api/pages";
import { siteApi } from "../api/site";
import { publicNavigation } from "../utils/navigation";
import type { CustomPage, SiteSettings } from "../types/blog";

export default function PublicShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState<SiteSettings | null>(() =>
    getCachedSiteSettings(),
  );
  const [navPages, setNavPages] = useState<CustomPage[]>([]);
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

  const siteTitle = site?.site_title || DEFAULT_SITE_SETTINGS.site_title;
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`);
    setOpen(false);
  };
  const footerText =
    site?.footer_text !== undefined
      ? site.footer_text
      : DEFAULT_SITE_SETTINGS.footer_text;
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#public-main"
        className="sr-only focus:not-sr-only focus:bg-accent focus:p-3"
      >
        跳至正文
      </a>
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-[1200px] items-center gap-6 px-4 md:px-6">
          <Link
            className="mr-auto min-w-0 truncate text-lg font-semibold tracking-tight text-primary"
            to="/"
            aria-label={`${siteTitle} 首页`}
          >
            {siteTitle}
          </Link>
          <nav
            aria-label="主导航"
            className="hidden items-center gap-6 md:flex"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className="py-5 text-sm text-muted-foreground hover:text-primary [&.active]:text-primary"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <form
            role="search"
            onSubmit={search}
            className="hidden items-center gap-1 lg:flex"
          >
            <Input
              aria-label="搜索文章"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文章…"
            />
            <IconButton type="submit" label="提交搜索" icon={<Search />} />
          </form>
          <Link
            to="/admin"
            aria-label="进入内容后台"
            className="hidden rounded-md p-2 text-muted-foreground hover:text-primary sm:block"
          >
            <LayoutDashboard className="size-4" />
          </Link>
          <ThemeToggle label="切换主题" />
          <IconButton
            label="打开主导航"
            icon={<Menu />}
            className="md:hidden"
            onClick={() => setOpen(true)}
          />
        </div>
      </header>
      <main
        id="public-main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 outline-none md:px-6 md:py-12"
      >
        {children}
      </main>
      <footer className="mt-12 border-t">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-[1fr_1fr] md:px-6">
          <div>
            <Link to="/" className="font-semibold">
              {siteTitle}
            </Link>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {site?.site_description || DEFAULT_SITE_SETTINGS.site_description}
            </p>
          </div>
          <nav
            aria-label="页脚导航"
            className="flex flex-wrap items-start gap-5 text-sm text-muted-foreground"
          >
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}>
                {item.label}
              </Link>
            ))}
            <Link to="/admin">管理后台</Link>
            <a
              className="inline-flex items-center gap-2"
              href={site?.rss_url || "/feed.xml"}
            >
              <Rss className="size-4" />
              RSS
            </a>
            {site?.github_url ? (
              <a href={site.github_url} target="_blank" rel="noreferrer">
                GitHub
              </a>
            ) : null}
          </nav>
          <p className="footer-meta text-xs text-muted-foreground md:col-span-2">
            {!footerText
              ? `© ${year} ${siteTitle}`
              : footerText.startsWith("©")
                ? footerText.replace("{year}", String(year))
                : `© ${year} ${siteTitle}. ${footerText}`}
          </p>
        </div>
      </footer>
      <Drawer open={open} title={siteTitle} onClose={() => setOpen(false)}>
        <form role="search" onSubmit={search} className="mb-6 flex gap-2">
          <Input
            aria-label="搜索文章"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文章…"
          />
          <IconButton type="submit" label="提交搜索" icon={<Search />} />
        </form>
        <nav aria-label="移动导航" className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 hover:bg-accent [&.active]:bg-accent"
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/admin"
            className="px-3 py-3"
            onClick={() => setOpen(false)}
          >
            管理后台
          </Link>
        </nav>
      </Drawer>
    </div>
  );
}
