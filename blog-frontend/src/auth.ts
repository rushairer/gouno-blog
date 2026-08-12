const issuer = import.meta.env.VITE_GOSSO_ISSUER || window.location.origin;
const clientID = import.meta.env.VITE_GOSSO_CLIENT_ID || 'blog-spa';
const redirectURI = `${window.location.origin}/callback`;
export const gossoAdminURL = import.meta.env.VITE_GOSSO_ADMIN_URL || '/identity-admin/';
const cookieSessionHeaders = { 'X-Gosso-Cookie-Session': '1' };

export interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; }
export interface LoginResult extends TokenResponse { requires_mfa?: boolean; mfa_token?: string; mfa_types?: string[]; }
export interface UserProfile { sub: string; name?: string; preferred_username?: string; email?: string; roles?: string[]; scope?: string; }
export interface SessionSnapshot { accessToken: null; refreshToken: null; profile: UserProfile | null; loggedIn: boolean; isAdmin: boolean; }
export interface MfaStatus { enabled: boolean; types: string[]; }
export interface MfaEnrollment { secret: string; otpauth_url: string; }
export interface PasskeyInfo { id: string; name: string; created_at?: string; }
export interface SessionInfo { id: string; ip: string; user_agent: string; created_at: string; last_active_at: string; }

const storageKeys = { pkceVerifier: 'gouno-blog:pkce_verifier', authState: 'gouno-blog:auth_state', postLoginRedirect: 'gouno-blog:post_login_redirect' };
const profileStorageKey = 'gouno-blog:session_profile';
function storedProfile(): UserProfile | null { try { const value = sessionStorage.getItem(profileStorageKey); return value ? JSON.parse(value) as UserProfile : null; } catch { return null; } }
let profile: UserProfile | null = storedProfile();

function randomString(length: number) {
  const bytes = new Uint8Array(length); crypto.getRandomValues(bytes);
  return Array.from(bytes, value => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[value % 66]).join('');
}
function toBase64URL(buffer: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function codeChallenge(verifier: string) { return toBase64URL(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
function cookie(name: string) { for (const value of document.cookie.split(';')) { const [key, ...parts] = value.trim().split('='); if (key === name) return decodeURIComponent(parts.join('=')); } return null; }
function gossoCSRFHeaders(): Record<string, string> { const value = cookie('__Host-csrf_token') || cookie('csrf_token'); return value ? { 'X-CSRF-Token': value } : {}; }
function unsafe(method?: string) { return !['GET', 'HEAD', 'OPTIONS'].includes((method || 'GET').toUpperCase()); }
async function envelope<T>(response: Response, fallback: string): Promise<T> { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || body.error_description || fallback); return body.data as T; }
function snapshot(): SessionSnapshot { const isAdmin = Boolean(profile?.roles?.includes('admin')); return { accessToken: null, refreshToken: null, profile, loggedIn: profile !== null, isAdmin }; }

export async function apiFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (unsafe(options.method) && !headers.has('X-CSRF-Token')) { const token = cookie('blog_csrf_token'); if (token) headers.set('X-CSRF-Token', token); }
  const response = await fetch(input, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) { profile = null; sessionStorage.removeItem(profileStorageKey); }
  return response;
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const [identity, session] = await Promise.all([
    fetch(`${issuer}/oidc/userinfo`, { credentials: 'same-origin' }),
    apiFetch('/api/me/session'),
  ]);
  if (!identity.ok || !session.ok) throw new Error('Failed to fetch user profile');
  const base = await identity.json() as UserProfile;
  const claims = await session.json() as { data: Pick<UserProfile, 'sub' | 'roles' | 'scope'> };
  profile = { ...base, ...claims.data }; sessionStorage.setItem(profileStorageKey, JSON.stringify(profile));
  return profile;
}

export async function redirectToAuthorize(destination = '/admin') {
  const verifier = randomString(64), state = randomString(32);
  sessionStorage.setItem(storageKeys.pkceVerifier, verifier); sessionStorage.setItem(storageKeys.authState, state); sessionStorage.setItem(storageKeys.postLoginRedirect, destination.startsWith('/') ? destination : '/admin');
  const url = new URL(`${issuer}/oauth2/authorize`);
  url.search = new URLSearchParams({ client_id: clientID, response_type: 'code', redirect_uri: redirectURI, scope: 'openid profile email', code_challenge: await codeChallenge(verifier), code_challenge_method: 'S256', state }).toString();
  window.location.assign(url);
}

export async function exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
  const verifier = sessionStorage.getItem(storageKeys.pkceVerifier);
  if (!verifier || state !== sessionStorage.getItem(storageKeys.authState)) throw new Error('Invalid OAuth callback state');
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientID, code, code_verifier: verifier, redirect_uri: redirectURI });
  const response = await fetch(`${issuer}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...cookieSessionHeaders }, body, credentials: 'same-origin' });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error_description || 'Token exchange failed'); }
  sessionStorage.removeItem(storageKeys.pkceVerifier); sessionStorage.removeItem(storageKeys.authState); return {};
}
export async function handleRedirectCallback(code: string, state: string) { await exchangeCodeForToken(code, state); await fetchUserProfile(); const redirectTo = sessionStorage.getItem(storageKeys.postLoginRedirect) || '/admin'; sessionStorage.removeItem(storageKeys.postLoginRedirect); return { tokenSet: {}, redirectTo }; }

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${issuer}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookieSessionHeaders }, body: JSON.stringify({ username, password }), credentials: 'same-origin' });
  const result = await envelope<LoginResult>(response, 'Login failed'); if (!result.requires_mfa) await fetchUserProfile(); return result;
}
export async function verifyMfa(mfaToken: string, code: string): Promise<TokenResponse> { const response = await fetch(`${issuer}/api/v1/auth/mfa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookieSessionHeaders }, body: JSON.stringify({ mfa_token: mfaToken, code }), credentials: 'same-origin' }); await envelope(response, 'MFA verification failed'); await fetchUserProfile(); return {}; }
export async function refreshAccessToken(): Promise<string> { const response = await fetch(`${issuer}/api/v1/auth/refresh`, { method: 'POST', headers: { ...cookieSessionHeaders, ...gossoCSRFHeaders() }, credentials: 'same-origin' }); if (!response.ok) throw new Error('Session refresh failed'); return ''; }

export const authSession = { storageKeys, getAccessToken: () => null, getRefreshToken: () => null, getUserProfile: () => profile, getSnapshot: snapshot, isLoggedIn: () => profile !== null, isAdmin: () => snapshot().isAdmin, saveTokenSet: (_: TokenResponse) => undefined, clear: () => { profile = null; sessionStorage.removeItem(profileStorageKey); Object.values(storageKeys).forEach(key => sessionStorage.removeItem(key)); }, async logout(redirectTo = '/') { await fetch(`${issuer}/api/v1/auth/logout`, { method: 'POST', headers: gossoCSRFHeaders(), credentials: 'same-origin', keepalive: true }); profile = null; sessionStorage.removeItem(profileStorageKey); Object.values(storageKeys).forEach(key => sessionStorage.removeItem(key)); window.location.assign(redirectTo); } };
export const getUserProfile = authSession.getUserProfile; export const isLoggedIn = authSession.isLoggedIn; export const canManageBlog = () => snapshot().isAdmin; export const isAdmin = canManageBlog; export const logout = () => { void authSession.logout('/'); };

async function gossoAPI<T>(path: string, options: RequestInit = {}, fallback = 'Request failed'): Promise<T> { const headers = new Headers(options.headers); if (unsafe(options.method) && !headers.has('X-CSRF-Token')) Object.entries(gossoCSRFHeaders()).forEach(([key, value]) => headers.set(key, value)); return envelope<T>(await fetch(`${issuer}${path}`, { ...options, headers, credentials: 'same-origin' }), fallback); }
export const gossoClient = {
  fetchUserProfile, getMfaStatus: () => gossoAPI<MfaStatus>('/api/v1/auth/mfa', {}, 'Failed to load MFA status'), enrollMfa: () => gossoAPI<MfaEnrollment>('/api/v1/auth/mfa/enroll', { method: 'POST' }, 'Failed to enroll MFA'),
  activateMfa: async (code: string) => { await gossoAPI('/api/v1/auth/mfa/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }, 'Failed to activate MFA'); return (await gossoAPI<{ backup_codes?: string[] }>('/api/v1/auth/mfa/backup-codes', { method: 'POST' }, 'Failed to generate backup codes')).backup_codes || []; },
  disableMfa: (currentPassword: string) => gossoAPI('/api/v1/auth/mfa', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword }) }, 'Failed to disable MFA'), generateBackupCodes: async () => (await gossoAPI<{ backup_codes?: string[] }>('/api/v1/auth/mfa/backup-codes', { method: 'POST' }, 'Failed to generate backup codes')).backup_codes || [],
  updateProfile: async (displayName: string) => { await gossoAPI('/api/v1/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName }) }, 'Failed to update profile'); return fetchUserProfile(); }, changePassword: (currentPassword: string, newPassword: string) => gossoAPI('/api/v1/auth/password/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }, 'Failed to change password'), requestEmailChange: (newEmail: string, password: string) => gossoAPI('/api/v1/auth/profile/email/change/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_email: newEmail, password }) }, 'Failed to request email verification code'), confirmEmailChange: async (newEmail: string, code: string) => { await gossoAPI('/api/v1/auth/profile/email/change/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_email: newEmail, code }) }, 'Failed to confirm email change'); return fetchUserProfile(); },
  listPasskeys: () => gossoAPI<PasskeyInfo[]>('/api/v1/auth/passkeys', {}, 'Failed to load passkeys'), deletePasskey: (id: string) => gossoAPI(`/api/v1/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to remove passkey'), listSessions: async () => (await gossoAPI<SessionInfo[]>('/api/v1/auth/sessions', {}, 'Failed to load sessions')).sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()), getCurrentSession: () => gossoAPI<SessionInfo>('/api/v1/auth/session', {}, 'Failed to load current session'), revokeSession: (id: string) => gossoAPI(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to revoke session'),
  registerPasskey: async (name: string) => {
    const begin = await gossoAPI<{ request_id: string; options: PublicKeyCredentialCreationOptions }>('/api/v1/passkey/register/begin', { method: 'POST' }, 'Failed to initialize passkey registration');
    const options = { ...begin.options, challenge: toBuffer(String(begin.options.challenge)), user: { ...begin.options.user, id: toBuffer(String(begin.options.user.id)) }, excludeCredentials: begin.options.excludeCredentials?.map(item => ({ ...item, id: toBuffer(String(item.id)) })) } as PublicKeyCredentialCreationOptions;
    const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;
    if (!credential?.response) throw new Error('Passkey registration cancelled or failed');
    const response = credential.response as AuthenticatorAttestationResponse;
    await gossoAPI(`/api/v1/passkey/register/complete?request_id=${encodeURIComponent(begin.request_id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: credential.id, rawId: toBase64URL(credential.rawId), type: credential.type, name, response: { clientDataJSON: toBase64URL(response.clientDataJSON), attestationObject: toBase64URL(response.attestationObject), transports: typeof response.getTransports === 'function' ? response.getTransports() : [] } }) }, 'Failed to verify passkey registration');
  },
};

export async function loginWithPasskey(): Promise<TokenResponse> {
  const begin = await envelope<{ request_id: string; options: PublicKeyCredentialRequestOptions }>(await fetch(`${issuer}/api/v1/passkey/login/begin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' }), 'Failed to begin passkey login');
  const options = { ...begin.options, challenge: toBuffer(String(begin.options.challenge)), allowCredentials: begin.options.allowCredentials?.map(item => ({ ...item, id: toBuffer(String(item.id)) })) } as PublicKeyCredentialRequestOptions;
  const assertion = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;
  if (!assertion?.response) throw new Error('Passkey authentication cancelled or failed');
  const response = assertion.response as AuthenticatorAssertionResponse;
  await envelope(await fetch(`${issuer}/api/v1/passkey/login/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookieSessionHeaders }, credentials: 'same-origin', body: JSON.stringify({ request_id: begin.request_id, id: assertion.id, rawId: toBase64URL(assertion.rawId), type: assertion.type, response: { clientDataJSON: toBase64URL(response.clientDataJSON), authenticatorData: toBase64URL(response.authenticatorData), signature: toBase64URL(response.signature), userHandle: response.userHandle ? toBase64URL(response.userHandle) : null } }) }), 'Passkey login failed');
  await fetchUserProfile(); return {};
}

function toBuffer(value: string) { const base64 = value.replace(/-/g, '+').replace(/_/g, '/'); const binary = atob(base64 + '='.repeat((4 - value.length % 4) % 4)); return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer; }
