import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { I18nProvider } from './i18n';
import PublicShell from './layouts/PublicShell';
import AdminShell from './layouts/AdminShell';
import Home from './pages/Home';
import ArticleIndex from './pages/ArticleIndex';
import PostDetail from './pages/PostDetail';
import TaxonomyIndex from './pages/TaxonomyIndex';
import Archive from './pages/Archive';
import About from './pages/About';
import NotFound from './pages/NotFound';
import Callback from './pages/Callback';
import Login from './pages/Login';
const Settings = React.lazy(() => import('./pages/Settings'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const Bookmarks = React.lazy(() => import('./pages/Bookmarks'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const AdminPosts = React.lazy(() => import('./pages/admin/Posts'));
const PostEditor = React.lazy(() => import('./pages/admin/PostEditor'));
const AdminComments = React.lazy(() => import('./pages/admin/Comments'));
const AdminTaxonomy = React.lazy(() => import('./pages/admin/Taxonomy'));
const AdminSiteSettings = React.lazy(() => import('./pages/admin/SiteSettings'));
const AdminUsers = React.lazy(() => import('./pages/admin/Users'));
const MediaLibrary = React.lazy(() => import('./pages/MediaLibrary'));
const AgentConsole = React.lazy(() => import('./pages/AgentConsole'));

function LegacyPostRedirect() {
  const { slug } = useParams();
  return <Navigate replace to={`/articles/${slug || ''}`} />;
}

function Public({ children }: { children: React.ReactNode }) {
  return <PublicShell><React.Suspense fallback={<div className="public-container state-page">正在载入内容…</div>}>{children}</React.Suspense></PublicShell>;
}

function Admin({ children }: { children: React.ReactNode }) {
  return <AdminShell><React.Suspense fallback={<div className="loading">正在载入工作区…</div>}>{children}</React.Suspense></AdminShell>;
}

export default function App() {
  return <I18nProvider><BrowserRouter><Routes>
    <Route path="/callback" element={<Callback />} />
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Public><Home /></Public>} />
    <Route path="/articles" element={<Public><ArticleIndex /></Public>} />
    <Route path="/articles/:slug" element={<Public><PostDetail /></Public>} />
    <Route path="/posts/:slug" element={<LegacyPostRedirect />} />
    <Route path="/categories" element={<Public><TaxonomyIndex type="categories" /></Public>} />
    <Route path="/categories/:slug" element={<Public><ArticleIndex mode="category" /></Public>} />
    <Route path="/tags" element={<Public><TaxonomyIndex type="tags" /></Public>} />
    <Route path="/tags/:slug" element={<Public><ArticleIndex mode="tag" /></Public>} />
    <Route path="/archive" element={<Public><Archive /></Public>} />
    <Route path="/about" element={<Public><About /></Public>} />
    <Route path="/search" element={<Public><ArticleIndex mode="search" /></Public>} />
    <Route path="/account/bookmarks" element={<Public><Bookmarks /></Public>} />
    <Route path="/account/notifications" element={<Public><Notifications /></Public>} />
    <Route path="/account/settings" element={<Public><Settings /></Public>} />
    <Route path="/bookmarks" element={<Navigate replace to="/account/bookmarks" />} />
    <Route path="/notifications" element={<Navigate replace to="/account/notifications" />} />
    <Route path="/settings" element={<Navigate replace to="/account/settings" />} />

    <Route path="/admin" element={<Navigate replace to="/admin/dashboard" />} />
    <Route path="/admin/dashboard" element={<Admin><Dashboard /></Admin>} />
    <Route path="/admin/analytics" element={<Navigate replace to="/admin/dashboard" />} />
    <Route path="/admin/posts" element={<Admin><AdminPosts /></Admin>} />
    <Route path="/admin/posts/new" element={<Admin><PostEditor /></Admin>} />
    <Route path="/admin/posts/:id/edit" element={<Admin><PostEditor /></Admin>} />
    <Route path="/admin/categories" element={<Admin><AdminTaxonomy type="categories" /></Admin>} />
    <Route path="/admin/tags" element={<Admin><AdminTaxonomy type="tags" /></Admin>} />
    <Route path="/admin/comments" element={<Admin><AdminComments /></Admin>} />
    <Route path="/admin/media" element={<Admin><MediaLibrary /></Admin>} />
    <Route path="/admin/settings" element={<Admin><AdminSiteSettings /></Admin>} />
    <Route path="/admin/users" element={<Admin><AdminUsers /></Admin>} />
    <Route path="/admin/agents" element={<Admin><AgentConsole /></Admin>} />
    <Route path="*" element={<Public><NotFound /></Public>} />
  </Routes></BrowserRouter></I18nProvider>;
}
