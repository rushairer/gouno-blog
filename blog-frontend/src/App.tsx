import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { ExternalLink, Globe2, LogIn, LogOut, Mail, Moon, Rss, Sun, Terminal } from 'lucide-react';
import { isLoggedIn, logout, getUserProfile, redirectToAuthorize } from './auth';
import type { UserProfile } from './auth';
import { I18nProvider, useI18n } from './i18n';

// Import Pages
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
import Callback from './pages/Callback';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Settings from './pages/Settings';

function Layout({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [logged, setLogged] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('gouno-blog:theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gouno-blog:theme', theme);
  }, [theme]);

  useEffect(() => {
    setLogged(isLoggedIn());
    setUser(getUserProfile());
  }, []);

  const handleLogout = () => {
    logout();
    setLogged(false);
    setUser(null);
  };

  const handleSignIn = () => {
    redirectToAuthorize('/admin');
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const nextLocale = locale === 'en' ? 'zh' : 'en';
  const nextLocaleShortLabel = nextLocale === 'en' ? 'EN' : '中';
  const nextLocaleLabel = nextLocale === 'en' ? 'English' : '中文';

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="navbar-container">
          <Link to="/" className="logo">
            <span className="logo__mark">
              <Terminal size={20} />
            </span>
            <span className="logo__text">{t('brand')}</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {t('home')}
            </NavLink>
            <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {t('adminPanel')}
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {t('settings')}
            </NavLink>

            <div className="nav-actions">
              <button
                className="icon-button theme-toggle"
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
                title={theme === 'dark' ? t('themeLight') : t('themeDark')}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="language-toggle"
                type="button"
                onClick={() => setLocale(nextLocale)}
                aria-label={`${t('language')}: switch to ${nextLocaleLabel}`}
                title={`${t('language')}: ${nextLocaleLabel}`}
              >
                <Globe2 size={16} />
                <span>{nextLocaleShortLabel}</span>
              </button>
              {logged ? (
                <div className="user-menu">
                  <span className="user-avatar">{(user?.name || user?.preferred_username || 'A').slice(0, 2).toUpperCase()}</span>
                  <span className="user-greeting">
                    {user?.name || user?.preferred_username || t('admin')}
                  </span>
                  <button className="icon-button" onClick={handleLogout} aria-label={t('signOut')} title={t('signOut')}>
                    <LogOut />
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={handleSignIn}>
                  <LogIn />
                  {t('signIn')}
                </button>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {children}
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Aben K.</p>
        <div className="footer-links" aria-label={t('footerLinks')}>
          <a href="https://github.com/rushairer" target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={14} />
          </a>
          <a href="/feed.xml" target="_blank" rel="noreferrer">
            RSS <Rss size={14} />
          </a>
          <Link to="/settings">
            Contact <Mail size={14} />
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/posts/:slug" element={<Layout><PostDetail /></Layout>} />
          <Route path="/admin" element={<Layout><Admin /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
