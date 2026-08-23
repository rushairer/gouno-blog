import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/ui';
import PublicShell from './layouts/PublicShell';
import AdminShell from './layouts/AdminShell';
import Home from './pages/Home';
import ArticleIndex from './pages/ArticleIndex';
import PostDetail from './pages/PostDetail';
import Categories from './pages/Categories';
import Tags from './pages/Tags';
import Archive from './pages/Archive';
import About from './pages/About';
import NotFound from './pages/NotFound';
import Callback from './pages/Callback';
import Login from './pages/Login';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from './auth';
import { useSiteMetadata } from './hooks/useSiteMetadata';
const Settings = React.lazy(() => import('./pages/Settings'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const AdminPosts = React.lazy(() => import('./pages/admin/Posts'));
const PostEditor = React.lazy(() => import('./pages/admin/PostEditor'));
const AdminPages = React.lazy(() => import('./pages/admin/Pages'));
const PageEditor = React.lazy(() => import('./pages/admin/PageEditor'));
const AdminComments = React.lazy(() => import('./pages/admin/Comments'));
const AdminCategories = React.lazy(() => import('./pages/admin/Categories'));
const AdminTags = React.lazy(() => import('./pages/admin/Tags'));
const AdminSiteSettings = React.lazy(() => import('./pages/admin/SiteSettings'));
const AdminUsers = React.lazy(() => import('./pages/admin/Users'));
const MediaLibrary = React.lazy(() => import('./pages/admin/MediaLibrary'));
const AIOperations = React.lazy(() => import('./pages/admin/AIOperations'));
const AdminNotifications = React.lazy(() => import('./pages/admin/Notifications'));
import CustomPageView from './pages/CustomPageView';

function Public({ children }: { children: React.ReactNode }) {
  return <PublicShell><React.Suspense fallback={<div className="public-container state-page">正在载入内容…</div>}>{children}</React.Suspense></PublicShell>;
}

function Admin({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const allowed = isLoggedIn() && canManageBlog();
  const [redirectError, setRedirectError] = useState('');
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const startAuthorization = useCallback(async () => {
    setRedirectError('');
    try {
      await redirectToAuthorize(returnTo);
    } catch {
      setRedirectError('无法打开登录页，请检查网络后重试。');
    }
  }, [returnTo]);

  useEffect(() => {
    if (!allowed) void startAuthorization();
  }, [allowed, startAuthorization]);

  if (!allowed) {
    return <div className="public-container state-page" role="status">
      <h1>需要登录</h1>
      <p>{redirectError || '正在前往安全登录页…'}</p>
      {redirectError ? <button className="btn btn-primary" type="button" onClick={() => void startAuthorization()}>重新登录</button> : null}
    </div>;
  }
  return <AdminShell><React.Suspense fallback={<div className="loading">正在载入工作区…</div>}>{children}</React.Suspense></AdminShell>;
}

export default function App() {
  useSiteMetadata();
  return <I18nProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/callback" element={<Callback />} />
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Public><Home /></Public>} />
    <Route path="/articles" element={<Public><ArticleIndex /></Public>} />
    <Route path="/articles/:slug" element={<Public><PostDetail /></Public>} />
    <Route path="/categories" element={<Public><Categories /></Public>} />
    <Route path="/categories/:slug" element={<Public><ArticleIndex mode="category" /></Public>} />
    <Route path="/tags" element={<Public><Tags /></Public>} />
    <Route path="/tags/:slug" element={<Public><ArticleIndex mode="tag" /></Public>} />
    <Route path="/archive" element={<Public><Archive /></Public>} />
    <Route path="/about" element={<Public><About /></Public>} />
    <Route path="/search" element={<Public><ArticleIndex mode="search" /></Public>} />
    <Route path="/account/notifications" element={<Navigate replace to="/admin/notifications" />} />
    <Route path="/account/settings" element={<Public><Settings /></Public>} />
    <Route path="/notifications" element={<Navigate replace to="/admin/notifications" />} />
    <Route path="/settings" element={<Navigate replace to="/account/settings" />} />

    <Route path="/admin" element={<Navigate replace to="/admin/dashboard" />} />
    <Route path="/admin/dashboard" element={<Admin><Dashboard /></Admin>} />
    <Route path="/admin/posts" element={<Admin><AdminPosts /></Admin>} />
    <Route path="/admin/posts/new" element={<Admin><PostEditor /></Admin>} />
    <Route path="/admin/posts/:id/edit" element={<Admin><PostEditor /></Admin>} />
    <Route path="/admin/pages" element={<Admin><AdminPages /></Admin>} />
    <Route path="/admin/pages/new" element={<Admin><PageEditor /></Admin>} />
    <Route path="/admin/pages/:id/edit" element={<Admin><PageEditor /></Admin>} />
    <Route path="/admin/categories" element={<Admin><AdminCategories /></Admin>} />
    <Route path="/admin/tags" element={<Admin><AdminTags /></Admin>} />
    <Route path="/admin/comments" element={<Admin><AdminComments /></Admin>} />
    <Route path="/admin/notifications" element={<Admin><AdminNotifications /></Admin>} />
    <Route path="/admin/media" element={<Admin><MediaLibrary /></Admin>} />
    <Route path="/admin/settings" element={<Admin><AdminSiteSettings /></Admin>} />
    <Route path="/admin/users" element={<Admin><AdminUsers /></Admin>} />
    <Route path="/admin/ai-ops" element={<Admin><AIOperations /></Admin>} />
    <Route path="/:slug" element={<Public><CustomPageView /></Public>} />
    <Route path="*" element={<Public><NotFound /></Public>} />
  </Routes></BrowserRouter></ToastProvider></I18nProvider>;
}
