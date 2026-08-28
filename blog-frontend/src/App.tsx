import React, { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { I18nProvider, useI18n } from "./i18n";
import { ToastProvider } from "./components/ui";
import { GossoProvider, RequireAuth } from "@gosso/client/react";
import { gossoClient, type BlogUserProfile, logout } from "./auth";
import { isActiveMember } from "./abilities";
import PublicShell from "./layouts/PublicShell";
import AdminShell from "./layouts/AdminShell";
import Home from "./pages/Home";
import ArticleIndex from "./pages/ArticleIndex";
import PostDetail from "./pages/PostDetail";
import Categories from "./pages/Categories";
import Tags from "./pages/Tags";
import Archive from "./pages/Archive";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import Callback from "./pages/Callback";
import { useSiteMetadata } from "./hooks/useSiteMetadata";
const Settings = React.lazy(() => import("./pages/Settings"));
const Dashboard = React.lazy(() => import("./pages/admin/Dashboard"));
const AdminPosts = React.lazy(() => import("./pages/admin/Posts"));
const PostEditor = React.lazy(() => import("./pages/admin/PostEditor"));
const AdminPages = React.lazy(() => import("./pages/admin/Pages"));
const PageEditor = React.lazy(() => import("./pages/admin/PageEditor"));
const AdminComments = React.lazy(() => import("./pages/admin/Comments"));
const AdminCategories = React.lazy(() => import("./pages/admin/Categories"));
const AdminTags = React.lazy(() => import("./pages/admin/Tags"));
const AdminSiteSettings = React.lazy(
  () => import("./pages/admin/SiteSettings"),
);
const AdminUsers = React.lazy(() => import("./pages/admin/Users"));
const MediaLibrary = React.lazy(() => import("./pages/admin/MediaLibrary"));
const AIOperations = React.lazy(() => import("./pages/admin/AIOperations"));
const AdminNotifications = React.lazy(
  () => import("./pages/admin/Notifications"),
);
const AccountNotifications = React.lazy(
  () => import("./pages/AccountNotifications"),
);
import CustomPageView from "./pages/CustomPageView";

function Public({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <PublicShell>
      <React.Suspense
        fallback={
          <div className="public-container state-page">
            <div className="state-card">
              <span className="spinner" aria-hidden="true" />
              <p>{t("common.loading")}</p>
            </div>
          </div>
        }
      >
        {children}
      </React.Suspense>
    </PublicShell>
  );
}

function AdminAccessDenied({ message }: { message?: string }) {
  const { t } = useI18n();
  const [logoutError, setLogoutError] = useState("");

  const switchAccount = async () => {
    setLogoutError("");
    try {
      await logout();
    } catch {
      setLogoutError(t("auth.logoutFailed"));
    }
  };

  return (
    <PublicShell>
      <div className="public-container state-page" role="alert">
        <div className="state-card">
          <h1>{t("auth.noAdminAccess")}</h1>
          <p>{message || t("auth.noAdminAccessDesc")}</p>
          <div className="state__actions">
            <a className="btn btn-primary" href="/admin/dashboard">
              {t("common.back")}
            </a>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void switchAccount()}
            >
              {t("auth.logout")}
            </button>
          </div>
          {logoutError ? <p className="form-error">{logoutError}</p> : null}
        </div>
      </div>
    </PublicShell>
  );
}

function Account({
  children,
  redirectTo,
}: {
  children: React.ReactNode;
  redirectTo: string;
}) {
  return (
    <RequireAuth
      redirectTo={redirectTo}
      fallback={
        <PublicShell>
          <div className="public-container state-page" role="status">
            <div className="state-card">
              <span className="spinner" aria-hidden="true" />
              <p>正在前往安全登录页…</p>
            </div>
          </div>
        </PublicShell>
      }
    >
      <Public>{children}</Public>
    </RequireAuth>
  );
}

function Admin({
  children,
  requiredPermissions,
}: {
  children: React.ReactNode;
  requiredPermissions?: string[];
}) {
  return (
    <RequireAuth<BlogUserProfile>
      permissions={requiredPermissions}
      predicate={(profile) =>
        Boolean(
          isActiveMember(profile) &&
          (requiredPermissions && requiredPermissions.length > 0
            ? true
            : Array.isArray(profile?.permissions) &&
              profile.permissions.length > 0),
        )
      }
      fallback={
        <PublicShell>
          <div className="public-container state-page" role="status">
            <div className="state-card">
              <span className="spinner" aria-hidden="true" />
              <h1>正在验证权限</h1>
              <p>正在前往安全登录页…</p>
            </div>
          </div>
        </PublicShell>
      }
      unauthorized={
        <AdminAccessDenied
          message={
            requiredPermissions && requiredPermissions.length > 0
              ? "您当前的角色没有访问该管理模块的权限。"
              : undefined
          }
        />
      }
    >
      <AdminShell>
        <React.Suspense
          fallback={<div className="loading">正在载入工作区…</div>}
        >
          {children}
        </React.Suspense>
      </AdminShell>
    </RequireAuth>
  );
}

export default function App() {
  useSiteMetadata();
  return (
    <GossoProvider
      client={gossoClient}
      initializeSession
      fallback={
        <div className="public-container state-page" role="status">
          <div className="state-card">
            <span className="spinner" aria-hidden="true" />
            <p>正在恢复登录状态…</p>
          </div>
        </div>
      }
    >
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/callback" element={<Callback />} />
              <Route
                path="/"
                element={
                  <Public>
                    <Home />
                  </Public>
                }
              />
              <Route
                path="/articles"
                element={
                  <Public>
                    <ArticleIndex />
                  </Public>
                }
              />
              <Route
                path="/articles/:slug"
                element={
                  <Public>
                    <PostDetail />
                  </Public>
                }
              />
              <Route
                path="/categories"
                element={
                  <Public>
                    <Categories />
                  </Public>
                }
              />
              <Route
                path="/categories/:slug"
                element={
                  <Public>
                    <ArticleIndex mode="category" />
                  </Public>
                }
              />
              <Route
                path="/tags"
                element={
                  <Public>
                    <Tags />
                  </Public>
                }
              />
              <Route
                path="/tags/:slug"
                element={
                  <Public>
                    <ArticleIndex mode="tag" />
                  </Public>
                }
              />
              <Route
                path="/archive"
                element={
                  <Public>
                    <Archive />
                  </Public>
                }
              />
              <Route
                path="/about"
                element={
                  <Public>
                    <About />
                  </Public>
                }
              />
              <Route
                path="/search"
                element={
                  <Public>
                    <ArticleIndex mode="search" />
                  </Public>
                }
              />
              <Route
                path="/account/notifications"
                element={
                  <Account redirectTo="/account/notifications">
                    <AccountNotifications />
                  </Account>
                }
              />
              <Route
                path="/account/settings"
                element={
                  <Account redirectTo="/account/settings">
                    <Settings />
                  </Account>
                }
              />
              <Route
                path="/notifications"
                element={<Navigate replace to="/account/notifications" />}
              />
              <Route
                path="/settings"
                element={<Navigate replace to="/account/settings" />}
              />

              <Route
                path="/admin"
                element={<Navigate replace to="/admin/dashboard" />}
              />
              <Route
                path="/admin/dashboard"
                element={
                  <Admin>
                    <Dashboard />
                  </Admin>
                }
              />
              <Route
                path="/admin/posts"
                element={
                  <Admin
                    requiredPermissions={["content.author", "content.manage"]}
                  >
                    <AdminPosts />
                  </Admin>
                }
              />
              <Route
                path="/admin/posts/new"
                element={
                  <Admin
                    requiredPermissions={["content.author", "content.manage"]}
                  >
                    <PostEditor />
                  </Admin>
                }
              />
              <Route
                path="/admin/posts/:id/edit"
                element={
                  <Admin
                    requiredPermissions={["content.author", "content.manage"]}
                  >
                    <PostEditor />
                  </Admin>
                }
              />
              <Route
                path="/admin/pages"
                element={
                  <Admin requiredPermissions={["content.manage"]}>
                    <AdminPages />
                  </Admin>
                }
              />
              <Route
                path="/admin/pages/new"
                element={
                  <Admin requiredPermissions={["content.manage"]}>
                    <PageEditor />
                  </Admin>
                }
              />
              <Route
                path="/admin/pages/:id/edit"
                element={
                  <Admin requiredPermissions={["content.manage"]}>
                    <PageEditor />
                  </Admin>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <Admin requiredPermissions={["content.manage"]}>
                    <AdminCategories />
                  </Admin>
                }
              />
              <Route
                path="/admin/tags"
                element={
                  <Admin requiredPermissions={["content.manage"]}>
                    <AdminTags />
                  </Admin>
                }
              />
              <Route
                path="/admin/comments"
                element={
                  <Admin requiredPermissions={["community.moderate"]}>
                    <AdminComments />
                  </Admin>
                }
              />
              <Route
                path="/admin/notifications"
                element={
                  <Admin>
                    <AdminNotifications />
                  </Admin>
                }
              />
              <Route
                path="/admin/media"
                element={
                  <Admin
                    requiredPermissions={["content.author", "content.manage"]}
                  >
                    <MediaLibrary />
                  </Admin>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <Admin requiredPermissions={["site.manage"]}>
                    <AdminSiteSettings />
                  </Admin>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <Admin requiredPermissions={["members.manage"]}>
                    <AdminUsers />
                  </Admin>
                }
              />
              <Route
                path="/admin/ai-ops"
                element={
                  <Admin requiredPermissions={["ai.manage"]}>
                    <AIOperations />
                  </Admin>
                }
              />
              <Route
                path="/:slug"
                element={
                  <Public>
                    <CustomPageView />
                  </Public>
                }
              />
              <Route
                path="*"
                element={
                  <Public>
                    <NotFound />
                  </Public>
                }
              />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </GossoProvider>
  );
}
