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
  csrfCookieName: "__Host-blog-csrf",
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const logout = gossoClient.logout;
export const apiFetch = gossoClient.apiFetch;

// MFA verification is owned by the OIDC provider.  This is a top-level
// navigation, not a fetch, so no authorization code or provider token is ever
// made available to application JavaScript.
export function stepUpMfa(
  returnTo = window.location.pathname + window.location.search,
): void {
  window.location.assign(
    `/api/auth/mfa/step-up?return_to=${encodeURIComponent(returnTo)}`,
  );
}

export function isMfaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  const lower = message.toLowerCase();
  return (
    lower.includes("recent_mfa_required") ||
    lower.includes("recent multi-factor") ||
    lower.includes("multi-factor") ||
    lower.includes("mfa_required")
  );
}

export { getBlogRoleLabel } from "./constants";
