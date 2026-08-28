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
export const gossoAdminURL =
  import.meta.env.VITE_GOSSO_ADMIN_URL || "/identity-admin";

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
  csrfCookieName: "blog_csrf_token",
});

export const redirectToAuthorize = async (returnTo = "/admin") => {
  if (typeof window !== "undefined") {
    window.location.href = `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
  }
};
gossoClient.redirectToAuthorize = redirectToAuthorize;

export const apiFetch = gossoClient.apiFetch;
export const stepUpMfa = gossoClient.stepUpMfa;

export { getBlogRoleLabel } from "./constants";

export async function logout(redirectTo = "/") {
  try {
    const csrfToken =
      typeof document !== "undefined"
        ? document.cookie
            .split("; ")
            .find((row) => row.startsWith("blog_csrf_token="))
            ?.split("=")[1] || ""
        : "";
    const resp = await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { logout_url?: string };
      if (data?.logout_url && typeof window !== "undefined") {
        window.location.href = data.logout_url;
        return;
      }
    }
  } catch (e) {
    console.error("BFF logout error", e);
  }
  return gossoClient.logout(redirectTo);
}
