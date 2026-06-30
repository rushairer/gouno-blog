import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { BookOpen, LogIn, LogOut } from 'lucide-react';
import { canManageBlog, isLoggedIn, logout, getUserProfile, redirectToAuthorize } from './auth';
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
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    setLogged(isLoggedIn());
    setUser(getUserProfile());
    setCanManage(canManageBlog());
  }, []);

  const handleLogout = () => {
    logout();
    setLogged(false);
    setUser(null);
    setCanManage(false);
  };

  const handleSignIn = () => {
    redirectToAuthorize('/admin');
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="navbar-container">
          <Link to="/" className="logo">
            <span className="logo__mark">AB</span>
            <span>{t('brand')}</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {t('home')}
            </NavLink>
            {logged && canManage && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('adminPanel')}
              </NavLink>
            )}
            {logged && (
              <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('settings')}
              </NavLink>
            )}

            <div className="nav-actions">
              <div className="language-toggle" aria-label={t('language')}>
                <button className={locale === 'en' ? 'active' : ''} type="button" onClick={() => setLocale('en')}>
                  EN
                </button>
                <button className={locale === 'zh' ? 'active' : ''} type="button" onClick={() => setLocale('zh')}>
                  中
                </button>
              </div>
              {logged ? (
                <>
                  <span className="user-greeting">
                    {t('greeting', { name: user?.name || user?.preferred_username || t('admin') })}
                  </span>
                  <button className="btn btn-secondary" onClick={handleLogout}>
                    <LogOut />
                    {t('signOut')}
                  </button>
                </>
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
        <div className="footer-brand">
          <BookOpen size={16} />
          <span>{t('brand')}</span>
        </div>
        <p>&copy; {new Date().getFullYear()} Aben. {t('footer')}</p>
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
