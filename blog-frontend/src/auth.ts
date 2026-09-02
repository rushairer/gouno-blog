import { createGossoClient } from "@gosso/client";
import { useUserProfile } from "@gosso/client/react";

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

export interface BlogPrincipal {
  id: number;
  issuer: string;
  subject: string;
  display_name: string;
  email: string;
}

export interface BlogUserProfile {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  principal?: BlogPrincipal;
  membership_status?: string;
  roles?: string[];
  permissions?: string[];
  authorization_version?: number;
  [key: string]: unknown;
}

export type BlogSessionData = BlogUserProfile;

const gossoIssuer = import.meta.env.VITE_GOSSO_ISSUER || window.location.origin;
export function getGossoAdminURL(user?: BlogUserProfile | null): string {
  if (import.meta.env.VITE_GOSSO_ADMIN_URL) {
    return import.meta.env.VITE_GOSSO_ADMIN_URL;
  }
  if (user?.principal?.issuer) {
    return user.principal.issuer;
  }
  if (user?.issuer) {
    return String(user.issuer);
  }
  if (
    gossoIssuer &&
    typeof window !== "undefined" &&
    gossoIssuer !== window.location.origin
  ) {
    return gossoIssuer;
  }
  return "";
}

export function useSafeUserProfile(): BlogUserProfile | null {
  return useUserProfile<BlogUserProfile>();
}

export const gossoAdminURL = import.meta.env.VITE_GOSSO_ADMIN_URL || "";

export const gossoClient = createGossoClient<BlogUserProfile>({
  issuer: gossoIssuer,
  clientId: "",
  redirectUri: "",
  scope: "",
  postLoginDefaultPath: "/admin",
  loginPath: `${gossoAdminURL.replace(/\/$/, "")}/login`,
  storagePrefix: "gouno-blog",
  sessionMode: "cookie",
  sessionProfileEndpoint: "/api/me/blog-session",
  sessionRefreshEndpoint: "/api/auth/refresh",
  authorizeEndpoint: "/api/auth/login",
  logoutEndpoint: "/api/auth/logout",
  csrfCookieName: "blog_csrf_token",
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const logout = gossoClient.logout;
export const apiFetch = gossoClient.apiFetch;

export async function stepUpMfa(
  code: string,
  type: "totp" | "backup_code" = "totp",
): Promise<{ auth_time: number; amr: string[] }> {
  const res = await apiFetch("/api/auth/mfa/step-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, type }),
  });
  if (!res.ok) {
    let msg = "验证失败，请稍后重试。";
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
      else if (data.message) msg = data.message;
    } catch {
      // fallback
    }
    throw new Error(msg);
  }
  const json = await res.json();
  return json.data || json;
}

export { getBlogRoleLabel } from "./constants";
