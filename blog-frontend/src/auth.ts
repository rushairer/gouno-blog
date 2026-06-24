// OIDC Auth helper using Authorization Code Grant with PKCE

const SSO_ISSUER = window.location.origin;
const CLIENT_ID = 'blog-spa';
const REDIRECT_URI = `${window.location.origin}/callback`;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
}

export interface UserProfile {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  roles?: string[];
}

// Helper to generate a random string for code verifier
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Helper to SHA256 hash a string and base64url encode it
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  
  // Convert ArrayBuffer to Base64url
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Save cookie (expires in seconds)
export function setCookie(name: string, value: string, maxAgeSeconds: number) {
  // Scoped to localhost/current domain, path /
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

// Delete cookie
export function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=-1; SameSite=Lax`;
}

// Redirect to SSO authorize endpoint
export async function redirectToAuthorize(customRedirectUri?: string) {
  const verifier = generateRandomString(64);
  const state = generateRandomString(16);
  
  localStorage.setItem('pkce_verifier', verifier);
  localStorage.setItem('auth_state', state);
  if (customRedirectUri) {
    localStorage.setItem('post_login_redirect', customRedirectUri);
  }

  const challenge = await generateCodeChallenge(verifier);
  
  const authUrl = new URL(`${SSO_ISSUER}/oauth2/authorize`);
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('code_challenge', challenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('state', state);
  
  window.location.href = authUrl.toString();
}

// Exchange code for token
export async function exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
  const savedState = localStorage.getItem('auth_state');
  const verifier = localStorage.getItem('pkce_verifier');
  
  if (state !== savedState) {
    throw new Error('State mismatch. Potential CSRF attack.');
  }
  if (!verifier) {
    throw new Error('PKCE verifier not found. Authentication flow expired.');
  }

  const body = new URLSearchParams();
  body.append('grant_type', 'authorization_code');
  body.append('client_id', CLIENT_ID);
  body.append('code', code);
  body.append('code_verifier', verifier);
  body.append('redirect_uri', REDIRECT_URI);

  const response = await fetch(`${SSO_ISSUER}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }

  const data: TokenResponse = await response.json();
  
  // Save tokens
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  
  // Set cookie for browser redirects (like subsequent /authorize hits)
  // Give it the same lifetime as the access token
  setCookie('access_token', data.access_token, data.expires_in);

  // Clean up PKCE
  localStorage.removeItem('pkce_verifier');
  localStorage.removeItem('auth_state');

  return data;
}

// Get user profile from ID token or UserInfo
export async function fetchUserProfile(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${SSO_ISSUER}/oidc/userinfo`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }

  const data = await response.json();
  
  // Also parse custom roles from token payload if possible
  try {
    const payloadBase64 = accessToken.split('.')[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(decodeURIComponent(escape(atob(padded))));
    if (payload.roles) {
      data.roles = payload.roles;
    }
  } catch (e) {
    console.error('Error parsing token roles', e);
  }

  localStorage.setItem('user_profile', JSON.stringify(data));
  return data;
}

// Get current Access Token
export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

// Get current User Profile
export function getUserProfile(): UserProfile | null {
  const profile = localStorage.getItem('user_profile');
  if (!profile) return null;
  try {
    return JSON.parse(profile);
  } catch {
    return null;
  }
}

// Check if user is logged in
export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
}

// Check if user is Admin
export function isAdmin(): boolean {
  const profile = getUserProfile();
  return profile?.roles?.includes('admin') || false;
}

// Log out user
export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_profile');
  deleteCookie('access_token');
  window.location.href = '/';
}
