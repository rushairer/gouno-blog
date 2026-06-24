import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { LogIn, LogOut, BookOpen } from 'lucide-react';
import { isLoggedIn, logout, getUserProfile, redirectToAuthorize } from './auth';
import type { UserProfile } from './auth';

// Import Pages
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
import Callback from './pages/Callback';
import Login from './pages/Login';
import Admin from './pages/Admin';

function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [logged, setLogged] = useState(false);

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
    redirectToAuthorize();
  };

  return (
    <div className="app-container">
      {/* Header Navigation */}
      <header className="navbar">
        <div className="navbar-container">
          <Link to="/" className="logo">
            Aben's DevBlog
          </Link>
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Home
            </NavLink>
            {logged && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Admin Panel
              </NavLink>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '16px' }}>
              {logged ? (
                <>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                    Hi, <strong style={{ color: 'var(--color-text-main)' }}>{user?.name || user?.preferred_username || 'Admin'}</strong>
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={handleLogout}>
                    <LogOut style={{ width: '14px', height: '14px' }} />
                    Sign Out
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={handleSignIn}>
                  <LogIn style={{ width: '14px', height: '14px' }} />
                  Sign In
                </button>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {children}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BookOpen style={{ width: '16px', height: '16px' }} />
          <span>Aben's DevBlog</span>
        </div>
        <p>&copy; {new Date().getFullYear()} Aben. Built with Go, React, and GOSSO SSO.</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* OIDC flow & Login routes run without layout wrapper to support full screen layouts */}
        <Route path="/callback" element={<Callback />} />
        <Route path="/login" element={<Login />} />

        {/* Regular routes with standard layout header & footer */}
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/posts/:slug" element={<Layout><PostDetail /></Layout>} />
        <Route path="/admin" element={<Layout><Admin /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}
