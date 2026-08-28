import { createGossoClient } from "@gosso/client";
import { MembershipStatus, RoleType } from "./constants";

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
  sessionProfileEndpoint: "/api/me/blog-session",
  csrfCookieName: "blog_csrf_token",
});

export const redirectToAuthorize = gossoClient.redirectToAuthorize;
export const isLoggedIn = gossoClient.isLoggedIn;
export const apiFetch = gossoClient.apiFetch;
export const stepUpMfa = gossoClient.stepUpMfa;

export function getCachedBlogSession(): BlogUserProfile | null {
  return gossoClient.getSnapshot().profile;
}

export function hasBlogPermission(permission: string): boolean {
  const profile = gossoClient.getSnapshot().profile;
  if (
    !profile ||
    (profile.membership_status &&
      profile.membership_status !== MembershipStatus.ACTIVE)
  )
    return false;
  return profile.permissions?.includes(permission) ?? false;
}

export function hasAnyBlogPermission(permissions: string[]): boolean {
  const profile = gossoClient.getSnapshot().profile;
  if (
    !profile ||
    (profile.membership_status &&
      profile.membership_status !== MembershipStatus.ACTIVE)
  )
    return false;
  return permissions.some((p) => profile.permissions?.includes(p));
}

export function getBlogRoleLabel(role?: string): string {
  const profile = gossoClient.getSnapshot().profile;
  const target = role || profile?.roles?.[0];
  switch (target) {
    case RoleType.OWNER:
      return "所有者";
    case RoleType.ADMIN:
      return "管理员";
    case RoleType.EDITOR:
      return "编辑";
    case RoleType.AUTHOR:
      return "作者";
    case RoleType.REVIEWER:
      return "审核员";
    default:
      return "成员";
  }
}

/** Non-authoritative display hint for public-page affordances. */
export function hasCachedAdminRole(): boolean {
  const profile = gossoClient.getSnapshot().profile;
  if (profile?.roles?.length) {
    return profile.membership_status === MembershipStatus.ACTIVE;
  }
  return Boolean(profile?.roles?.includes("admin"));
}

/** @deprecated Use RequireAuth / useRequireAuth for route authorization. */
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
