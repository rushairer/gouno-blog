import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Menu, Moon, Rss, Search, Sun, X } from 'lucide-react';
import { DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { publicNavigation } from '../navigation';
import { getSiteSettings } from '../lib/blog-api';
import type { SiteSettings } from '../types/blog';

export default function PublicShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('gouno-blog:theme') === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('gouno-blog:theme', theme);
  }, [theme]);

  useEffect(() => {
    getSiteSettings().then(setSite).catch(() => {
      // Static brand defaults keep the public site usable during API outages.
    });
  }, []);

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header__inner">
          <Link className="wordmark" to="/" aria-label={`${site?.site_title || DEFAULT_SITE_SETTINGS.site_title} 首页`}>{site?.site_title || DEFAULT_SITE_SETTINGS.site_title}</Link>
          <nav id="public-navigation" className={`public-nav ${open ? 'is-open' : ''}`} aria-label="主导航">
            {publicNavigation.map((item) => (
              <NavLink key={item.path} to={item.path} onClick={() => setOpen(false)}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="public-actions">
            <Link className="public-admin-link" to="/admin" aria-label="进入内容后台">
              <LayoutDashboard /><span>后台</span>
            </Link>
            <form
              className="header-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              <label className="sr-only" htmlFor="global-search">搜索文章</label>
              <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" />
              <button type="submit" aria-label="提交搜索"><Search /></button>
            </form>
            <button className="bare-icon" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="切换主题">
              {theme === 'light' ? <Moon /> : <Sun />}
            </button>
            <button
              className="bare-icon menu-toggle"
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? '关闭导航' : '打开导航'}
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
            <Link className="wordmark" to="/">{site?.site_title || DEFAULT_SITE_SETTINGS.site_title}</Link>
            <p>{site?.site_description || DEFAULT_SITE_SETTINGS.site_description}</p>
          </div>
          <div className="footer-nav">
            <Link to="/articles">文章</Link><Link to="/archive">归档</Link><Link to="/about">关于</Link>
            <Link to="/admin"><LayoutDashboard /> 管理后台</Link>
            <a href={site?.rss_url || '/feed.xml'}><Rss /> RSS</a>
            {site?.github_url ? <a href={site.github_url} target="_blank" rel="noreferrer">GitHub</a> : null}
          </div>
        </div>
        <div className="footer-meta">© {new Date().getFullYear()} {site?.site_title || DEFAULT_SITE_SETTINGS.site_title}. Built with care, code, and curiosity.</div>
      </footer>
    </div>
  );
}
