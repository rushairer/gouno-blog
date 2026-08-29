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
const gossoClientID = import.meta.env.VITE_GOSSO_CLIENT_ID || "blog-spa";
// Blog authorization is local and server-verified; never request an OAuth
// `admin` scope merely to display or decide Blog permissions.
const gossoScope = import.meta.env.VITE_GOSSO_SCOPE || "openid profile email";
export function resolveGossoAdminURL(): string {
  if (import.meta.env.VITE_GOSSO_ADMIN_URL) {
    return import.meta.env.VITE_GOSSO_ADMIN_URL;
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (hostname.startsWith("blog.")) {
      const ssoHost = hostname.replace(/^blog\./, "sso.");
      const portSuffix = port ? `:${port}` : "";
      return `${protocol}//${ssoHost}${portSuffix}`;
    }
    if (hostname.endsWith(".local") || hostname.endsWith(".local.test")) {
      return "https://sso.dev.local";
    }
  }
  return "https://sso.io84.com";
}

export const gossoAdminURL = resolveGossoAdminURL();

export const gossoClient = createGossoClient<BlogUserProfile>({
  issuer: gossoIssuer,
  clientId: gossoClientID,
  redirectUri: `${window.location.origin}/callback`,
  scope: gossoScope,
  postLoginDefaultPath: "/admin",
  loginPath: `${gossoAdminURL.replace(/\/$/, "")}/login`,
  storagePrefix: "gouno-blog",
  sessionMode: "cookie",
  sessionProfileEndpoint: "/api/me/blog-session",
  authorizeEndpoint: "/api/auth/login",
  logoutEndpoint: "/api/auth/logout",
  csrfCookieName: "blog_csrf_token",
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const logout = gossoClient.logout;
export const apiFetch = gossoClient.apiFetch;
export const stepUpMfa = gossoClient.stepUpMfa;

export { getBlogRoleLabel } from "./constants";
