import { createGossoClient } from '@gosso/client';

export type {
  LoginResult,
  TokenResponse,
  UserProfile,
  MfaStatus,
  MfaEnrollment,
  PasskeyInfo,
  SessionInfo,
  SessionSnapshot,
} from '@gosso/client';

const gossoIssuer = import.meta.env.VITE_GOSSO_ISSUER || window.location.origin;
const gossoClientID = import.meta.env.VITE_GOSSO_CLIENT_ID || 'blog-spa';
const gossoScope = import.meta.env.VITE_GOSSO_SCOPE || 'openid profile email admin';
export const gossoAdminURL = import.meta.env.VITE_GOSSO_ADMIN_URL || '/identity-admin';

export const gossoClient = createGossoClient({
  issuer: gossoIssuer,
  clientId: gossoClientID,
  redirectUri: `${window.location.origin}/callback`,
  scope: gossoScope,
  postLoginDefaultPath: '/admin',
  loginPath: '/login',
  storagePrefix: 'gouno-blog',
  sessionMode: 'cookie',
  sessionProfileEndpoint: '/api/me/session',
  csrfCookieName: 'blog_csrf_token',
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const isLoggedIn = gossoClient.isLoggedIn;
export const apiFetch = gossoClient.apiFetch;

export function canManageBlog(): boolean {
  const snapshot = gossoClient.getSnapshot();
  // GOSSO's cookie-session userinfo response can omit roles after the OAuth
  // code exchange, while retaining the granted scopes. The backend remains
  // the authorization boundary and verifies the admin role from the JWT.
  return Boolean(snapshot.profile?.roles?.includes('admin') || snapshot.profile?.scope?.split(/\s+/).includes('admin'));
}

export function isAdmin(): boolean {
  return canManageBlog();
}

export async function logout() {
  try {
    await gossoClient.logout('/');
  } catch {
    throw new Error('退出登录失败，请重试。');
  }
}
