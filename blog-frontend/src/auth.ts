import { createGossoClient } from '@gosso/client';
import type { LoginResult, SessionSnapshot, TokenResponse } from '@gosso/client';

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

export const authSession = {
  storageKeys: gossoClient.storageKeys,
  getAccessToken: gossoClient.getAccessToken,
  getRefreshToken: gossoClient.getRefreshToken,
  getUserProfile: gossoClient.getUserProfile,
  getSnapshot: gossoClient.getSnapshot,
  isLoggedIn: gossoClient.isLoggedIn,
  saveTokenSet: gossoClient.saveTokenSet,
  clear: gossoClient.clear,
  logout,
  getPostLoginRedirect(defaultPath = '/admin'): string {
    return sessionStorage.getItem(gossoClient.storageKeys.postLoginRedirect) || defaultPath;
  },
  clearPostLoginRedirect() {
    sessionStorage.removeItem(gossoClient.storageKeys.postLoginRedirect);
  },
};

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const exchangeCodeForToken = gossoClient.exchangeCodeForToken;
export const handleRedirectCallback = gossoClient.handleRedirectCallback;
export const fetchUserProfile = gossoClient.fetchUserProfile;
export const getAccessToken = gossoClient.getAccessToken;
export const getUserProfile = gossoClient.getUserProfile;
export const isLoggedIn = gossoClient.isLoggedIn;
export const apiFetch = gossoClient.apiFetch;

export function canManageBlog(): boolean {
  const snapshot: SessionSnapshot = authSession.getSnapshot();
  // GOSSO's cookie-session userinfo response can omit roles after the OAuth
  // code exchange, while retaining the granted scopes. The backend remains
  // the authorization boundary and verifies the admin role from the JWT.
  return Boolean(snapshot.profile?.roles?.includes('admin') || snapshot.profile?.scope?.split(/\s+/).includes('admin'));
}

export function isAdmin(): boolean {
  return canManageBlog();
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

// The blog and GOSSO intentionally have separate CSRF cookies on the shared
// HTTPS origin. @gosso/client 0.2.x accepts the first matching cookie and
// redirects even if logout was rejected, which can leave the SSO session live.
// Pin this request to GOSSO's __Host cookie and redirect only after revocation.
export async function logout() {
  const csrf = readCookie('__Host-csrf_token') || readCookie('csrf_token');
  const response = await fetch(`${gossoIssuer}/api/v1/auth/logout`, {
    method: 'POST',
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    credentials: 'same-origin',
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error('退出登录失败，请重试。');
  }
  gossoClient.clear();
  window.location.assign('/');
}

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  return gossoClient.loginWithPassword(username, password);
}

export async function verifyMfa(mfaToken: string, code: string): Promise<TokenResponse> {
  return gossoClient.verifyMfa(mfaToken, code);
}

export async function loginWithPasskey(): Promise<TokenResponse> {
  return gossoClient.loginWithPasskey();
}
