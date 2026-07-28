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

export const gossoClient = createGossoClient({
  issuer: gossoIssuer,
  clientId: gossoClientID,
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

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const exchangeCodeForToken = gossoClient.exchangeCodeForToken;
export const handleRedirectCallback = gossoClient.handleRedirectCallback;
export const fetchUserProfile = gossoClient.fetchUserProfile;
export const getAccessToken = gossoClient.getAccessToken;
export const getUserProfile = gossoClient.getUserProfile;
export const isLoggedIn = gossoClient.isLoggedIn;

let refreshPromise: Promise<string> | null = null;

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Refresh tokens issued by the OAuth authorization-code flow must be exchanged
 * through the OAuth token endpoint. The generic session refresh endpoint drops
 * the OAuth client binding, causing the blog backend to reject the replacement
 * token's missing `aud`/`client_id` claims with 401.
 */
export async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = gossoClient.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token found');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: gossoClientID,
      refresh_token: refreshToken,
    });
    const response = await fetch(`${gossoIssuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await response.json() as TokenResponse & { error_description?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || 'Token refresh failed');
    }
    gossoClient.saveTokenSet(data);
    return data.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function tokenHasExpired() {
  const issuedAt = Number(localStorage.getItem(gossoClient.storageKeys.tokenIssuedAt));
  const expiresIn = Number(localStorage.getItem(gossoClient.storageKeys.tokenExpiresIn)) || 900;
  return issuedAt > 0 && Date.now() - issuedAt > expiresIn * 1000;
}

async function authorizeRequest(input: RequestInfo | URL, options: RequestInit, token: string) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...options, headers });
}

export async function apiFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  let token = gossoClient.getAccessToken();
  if (!token) {
    void redirectToAuthorize(currentPath());
    return new Response(null, { status: 401 });
  }

  try {
    if (tokenHasExpired()) token = await refreshAccessToken();
    let response = await authorizeRequest(input, options, token);
    if (response.status !== 401 || !gossoClient.getRefreshToken()) return response;

    token = await refreshAccessToken();
    response = await authorizeRequest(input, options, token);
    return response;
  } catch {
    authSession.clear();
    void redirectToAuthorize(currentPath());
    return new Response(null, { status: 401 });
  }
}

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
