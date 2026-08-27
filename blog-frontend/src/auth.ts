import { createGossoClient } from "@gosso/client";

export type {
  LoginResult,
  TokenResponse,
  UserProfile,
  MfaStatus,
  MfaEnrollment,
  PasskeyInfo,
  SessionInfo,
  SessionSnapshot,
} from "@gosso/client";

const gossoIssuer = import.meta.env.VITE_GOSSO_ISSUER || window.location.origin;
const gossoClientID = import.meta.env.VITE_GOSSO_CLIENT_ID || "blog-spa";
const gossoScope = import.meta.env.VITE_GOSSO_SCOPE || "openid profile email";
export const gossoAdminURL =
  import.meta.env.VITE_GOSSO_ADMIN_URL || "/identity-admin";

export const gossoClient = createGossoClient({
  issuer: gossoIssuer,
  clientId: gossoClientID,
  redirectUri: `${window.location.origin}/callback`,
  scope: gossoScope,
  postLoginDefaultPath: "/admin",
  loginPath: `${gossoAdminURL.replace(/\/$/, "")}/login`,
  storagePrefix: "gouno-blog",
  // Remove this explicit setting after the registry dependency moves to 0.4.
  sessionMode: "cookie",
  sessionProfileEndpoint: "/api/me/session",
  csrfCookieName: "blog_csrf_token",
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const isLoggedIn = gossoClient.isLoggedIn;
export const apiFetch = gossoClient.apiFetch;

export type ManagementAccess = "admin" | "denied" | "anonymous" | "error";

/**
 * Resolves access from the blog API's verified cookie session. OAuth scopes
 * describe what was requested; only the JWT role claim authorizes the admin
 * workspace.
 */
export async function getManagementAccess(): Promise<ManagementAccess> {
  if (!isLoggedIn()) return "anonymous";

  try {
    const response = await gossoClient.apiFetch("/api/me/session");
    if (response.status === 401) return "anonymous";
    if (!response.ok) return "error";

    const payload = (await response.json()) as {
      data?: { roles?: unknown };
      roles?: unknown;
    };
    const roles = payload.data?.roles ?? payload.roles;
    return Array.isArray(roles) && roles.includes("admin") ? "admin" : "denied";
  } catch {
    return "error";
  }
}

/** Non-authoritative display hint for public-page affordances. */
export function hasCachedAdminRole(): boolean {
  return Boolean(gossoClient.getSnapshot().profile?.roles?.includes("admin"));
}

/** @deprecated Use getManagementAccess for route authorization. */
export function canManageBlog(): boolean {
  return hasCachedAdminRole();
}

export async function logout() {
  try {
    await gossoClient.logout("/");
  } catch {
    throw new Error("退出登录失败，请重试。");
  }
}
