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
      const data = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      if (data?.error?.message) msg = data.error.message;
      else if (data?.message) msg = data.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const envelope = (await response.json()) as {
    data?: { access_token?: string; auth_time: number; amr: string[] };
  };
  return (
    envelope.data ||
    (envelope as unknown as {
      access_token?: string;
      auth_time: number;
      amr: string[];
    })
  );
};

export type ManagementAccess = "admin" | "denied" | "anonymous" | "error";

export interface BlogPrincipal {
  id: number;
  issuer: string;
  subject: string;
  display_name: string;
  email: string;
}

export interface BlogSessionData {
  principal: BlogPrincipal;
  membership_status: string;
  roles: string[];
  permissions: string[];
  authorization_version: number;
}

let cachedBlogSession: BlogSessionData | null = null;

export function getCachedBlogSession(): BlogSessionData | null {
  return cachedBlogSession;
}

export function hasBlogPermission(permission: string): boolean {
  if (!cachedBlogSession || cachedBlogSession.membership_status !== "active")
    return false;
  return cachedBlogSession.permissions?.includes(permission) ?? false;
}

export function hasAnyBlogPermission(permissions: string[]): boolean {
  if (!cachedBlogSession || cachedBlogSession.membership_status !== "active")
    return false;
  return permissions.some((p) => cachedBlogSession?.permissions?.includes(p));
}

export function getBlogRoleLabel(role?: string): string {
  const target = role || cachedBlogSession?.roles?.[0];
  switch (target) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "editor":
      return "编辑";
    case "author":
      return "作者";
    case "moderator":
      return "审核员";
    default:
      return "成员";
  }
}

/**
 * Resolves access from the blog API's verified cookie session.
 * Any active member with blog roles/permissions is granted management access.
 */
export async function getManagementAccess(): Promise<ManagementAccess> {
  if (!isLoggedIn()) {
    cachedBlogSession = null;
    return "anonymous";
  }

  try {
    const response = await gossoClient.apiFetch("/api/me/blog-session");
    if (response.status === 401) {
      cachedBlogSession = null;
      return "anonymous";
    }
    if (!response.ok) return "error";

    const payload = (await response.json()) as {
      data?: BlogSessionData;
    } & BlogSessionData;
    const session = payload.data || payload;
    cachedBlogSession = session;

    const isActive = session.membership_status
      ? session.membership_status === "active"
      : true;

    if (
      isActive &&
      Array.isArray(session.permissions) &&
      session.permissions.length > 0
    ) {
      return "admin";
    }
    return "denied";
  } catch {
    return "error";
  }
}

/** Non-authoritative display hint for public-page affordances. */
export function hasCachedAdminRole(): boolean {
  if (cachedBlogSession?.roles?.length) {
    return cachedBlogSession.membership_status === "active";
  }
  return Boolean(gossoClient.getSnapshot().profile?.roles?.includes("admin"));
}

/** @deprecated Use getManagementAccess for route authorization. */
export function canManageBlog(): boolean {
  return hasCachedAdminRole();
}

export async function logout() {
  cachedBlogSession = null;
  try {
    await gossoClient.logout("/");
  } catch {
    throw new Error("退出登录失败，请重试。");
  }
}
