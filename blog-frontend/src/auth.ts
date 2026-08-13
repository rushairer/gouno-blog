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
export const gossoAdminURL = import.meta.env.VITE_GOSSO_ADMIN_URL || '/identity-admin/';
// `__Host-` cookies are intentionally accepted only over HTTPS. Use the
// SDK's bearer-token flow for the local HTTP gateway so a successful login
// does not immediately lose its browser session.
export const useCookieSession = window.location.protocol === 'https:';

export const gossoClient = createGossoClient({
  issuer: gossoIssuer,
  clientId: gossoClientID,
  redirectUri: `${window.location.origin}/callback`,
  scope: 'openid profile email',
  postLoginDefaultPath: '/admin',
  loginPath: '/login',
  storagePrefix: 'gouno-blog',
  ...(useCookieSession ? {
    sessionMode: 'cookie' as const,
    sessionProfileEndpoint: '/api/me/session',
    csrfCookieName: 'blog_csrf_token',
  } : {}),
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
  logout: gossoClient.logout,
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
  return Boolean(snapshot.profile?.roles?.includes('admin'));
}

export function isAdmin(): boolean {
  return canManageBlog();
}

export function logout() {
  void gossoClient.logout('/');
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
