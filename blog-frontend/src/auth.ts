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

export const gossoClient = createGossoClient({
  issuer: import.meta.env.VITE_GOSSO_ISSUER || window.location.origin,
  clientId: import.meta.env.VITE_GOSSO_CLIENT_ID || 'blog-spa',
  redirectUri: `${window.location.origin}/callback`,
  scope: 'openid profile email',
  postLoginDefaultPath: '/admin',
  loginPath: '/login',
  storagePrefix: 'gouno-blog',
});

const legacyStorageKeys = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  userProfile: 'user_profile',
  pkceVerifier: 'pkce_verifier',
  authState: 'auth_state',
  postLoginRedirect: 'post_login_redirect',
  tokenIssuedAt: 'token_issued_at',
  tokenExpiresIn: 'token_expires_in',
  refreshLock: 'auth_refresh_lock',
} satisfies Record<keyof typeof gossoClient.storageKeys, string>;

function migrateLegacyStorageKeys() {
  Object.entries(legacyStorageKeys).forEach(([name, legacyKey]) => {
    const nextKey = gossoClient.storageKeys[name as keyof typeof gossoClient.storageKeys];
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue && !localStorage.getItem(nextKey)) {
      localStorage.setItem(nextKey, legacyValue);
    }
  });
}

migrateLegacyStorageKeys();

function readClaimsFromAccessToken(accessToken: string | null): Record<string, unknown> | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function claimHasRole(claims: Record<string, unknown> | null, role: string): boolean {
  const roles = claims?.roles;
  return Array.isArray(roles) && roles.some((item) => item === role);
}

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
    return localStorage.getItem(gossoClient.storageKeys.postLoginRedirect) || defaultPath;
  },

  clearPostLoginRedirect() {
    localStorage.removeItem(gossoClient.storageKeys.postLoginRedirect);
  },
};

export const apiFetch = gossoClient.apiFetch;
export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const exchangeCodeForToken = gossoClient.exchangeCodeForToken;
export const handleRedirectCallback = gossoClient.handleRedirectCallback;
export const fetchUserProfile = gossoClient.fetchUserProfile;
export const refreshAccessToken = gossoClient.refreshAccessToken;
export const getAccessToken = gossoClient.getAccessToken;
export const getUserProfile = gossoClient.getUserProfile;
export const isLoggedIn = gossoClient.isLoggedIn;

export function canManageBlog(): boolean {
  const snapshot: SessionSnapshot = authSession.getSnapshot();
  if (snapshot.profile?.roles?.includes('admin')) return true;
  return claimHasRole(readClaimsFromAccessToken(snapshot.accessToken), 'admin');
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
