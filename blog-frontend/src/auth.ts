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
// Blog authorization is local and server-verified; never request an OAuth
// `admin` scope merely to display or decide Blog permissions.
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

export const stepUpMfa = async (
  code: string,
  type: "totp" | "backup_code" = "totp",
): Promise<{ access_token?: string; auth_time: number; amr: string[] }> => {
  const response = await apiFetch(`${gossoIssuer}/api/v1/auth/mfa/step-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, type }),
  });
  if (!response.ok) {
    let msg = "Failed to complete step-up MFA";
    try {
      const data = (await response.json()) as { error?: { message?: string }; message?: string };
      if (data?.error?.message) msg = data.error.message;
      else if (data?.message) msg = data.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const envelope = (await response.json()) as { data?: { access_token?: string; auth_time: number; amr: string[] } };
  return envelope.data || (envelope as unknown as { access_token?: string; auth_time: number; amr: string[] });
};

export type ManagementAccess = "admin" | "denied" | "anonymous" | "error";

/**
 * Resolves access from the blog API's verified cookie session. OAuth scopes
 * describe what was requested; only the JWT role claim authorizes the admin
 * workspace.
 */
export async function getManagementAccess(): Promise<ManagementAccess> {
  if (!isLoggedIn()) return "anonymous";

  try {
    // `/api/me/session` is reserved by the gateway as a GOSSO session probe.
    // This endpoint reaches Blog's JWT-verifying middleware.
    const response = await gossoClient.apiFetch("/api/me/blog-session");
    if (response.status === 401) return "anonymous";
    if (!response.ok) return "error";

    const payload = (await response.json()) as {
      data?: { permissions?: unknown };
      permissions?: unknown;
    };
    const permissions = payload.data?.permissions ?? payload.permissions;
    return Array.isArray(permissions) && permissions.includes("site.manage")
      ? "admin"
      : "denied";
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
