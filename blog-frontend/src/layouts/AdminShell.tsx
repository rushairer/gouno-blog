import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ExternalLink, LogOut, Menu, Search } from 'lucide-react';
import { adminNavigation } from '../navigation';
import { getUserProfile, logout } from '../auth';
import { DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { getSiteSettings } from '../lib/blog-api';

function currentLabel(pathname: string) {
  if (pathname === '/admin/posts/new') return '新建文章';
  if (/^\/admin\/posts\/[^/]+\/edit$/.test(pathname)) return '编辑文章';
  return adminNavigation.flatMap((group) => group.items).find((item) => pathname.startsWith(item.path))?.label || '后台';
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const user = getUserProfile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [siteName, setSiteName] = useState(DEFAULT_SITE_SETTINGS.site_title);

  useEffect(() => {
    getSiteSettings().then((settings) => setSiteName(settings.site_title || DEFAULT_SITE_SETTINGS.site_title)).catch(() => {
      // Keep the administration shell available when public site settings fail.
    });
  }, []);

  return (
    <div className={`admin-shell ${mobileOpen ? 'admin-nav-open' : ''}`}>
      <aside className="admin-sidebar" id="admin-sidebar">
        <Link className="wordmark admin-wordmark" to="/admin/dashboard">{siteName}</Link>
        <nav aria-label="后台导航">
          {adminNavigation.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <NavLink key={item.path} to={item.path} onClick={() => setMobileOpen(false)}>
                  {item.icon}<span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="admin-profile">
          <span className="admin-avatar">{(user?.name || user?.preferred_username || 'A').slice(0, 2).toUpperCase()}</span>
          <div><strong>{user?.name || user?.preferred_username || '管理员'}</strong><small>管理员</small></div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="bare-icon admin-menu" type="button" aria-label="切换后台导航" aria-expanded={mobileOpen} aria-controls="admin-sidebar" onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
          <div className="breadcrumb"><Link to="/admin/dashboard">后台</Link><span>/</span><strong>{currentLabel(location.pathname)}</strong></div>
          <div className="admin-search"><Search /><input aria-label="搜索后台内容" placeholder="搜索文章、分类、标签…" /></div>
          <div className="admin-topbar-actions">
            <Link to="/" target="_blank" rel="noreferrer" aria-label="在新窗口查看前台站点"><ExternalLink /><span>查看站点</span></Link>
            <button type="button" onClick={logout} aria-label="退出登录"><LogOut /><span>退出登录</span></button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
      {mobileOpen ? <button className="admin-nav-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="关闭后台导航" /> : null}
    </div>
  );
}
