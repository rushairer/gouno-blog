import { getCachedBlogSession, hasBlogPermission } from "../auth";
import type { MediaItem } from "../api/media";
import type { Post } from "../types/blog";

export type AbilityAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "restore"
  | "batch"
  | "manage"
  | "moderate";

export type AbilitySubject =
  | "post"
  | "media"
  | "comment"
  | "category"
  | "tag"
  | "page"
  | "site"
  | "members"
  | "ai"
  | "dashboard";

export interface AbilityChecker {
  can: (
    action: AbilityAction,
    subject: AbilitySubject,
    resource?:
      | Post
      | MediaItem
      | {
          created_by_principal_id?: number | null;
          usage_count?: number;
          references_count?: number;
        }
      | null,
  ) => boolean;
  cannot: (
    action: AbilityAction,
    subject: AbilitySubject,
    resource?:
      | Post
      | MediaItem
      | {
          created_by_principal_id?: number | null;
          usage_count?: number;
          references_count?: number;
        }
      | null,
  ) => boolean;
  principalId: number | null;
}

export function defineAbility(): AbilityChecker {
  const session = getCachedBlogSession();
  const currentPrincipalId = session?.principal?.id ?? null;
  const isSuspended = Boolean(
    session?.membership_status && session.membership_status !== "active",
  );

  const can = (
    action: AbilityAction,
    subject: AbilitySubject,
    resource?: any,
  ): boolean => {
    if (isSuspended) return false;

    // Site / Members / AI management
    if (subject === "site") return hasBlogPermission("site.manage");
    if (subject === "members") return hasBlogPermission("members.manage");
    if (subject === "ai") return hasBlogPermission("ai.manage");
    if (subject === "comment" || action === "moderate") {
      return hasBlogPermission("community.moderate");
    }

    // Categories, Tags, Pages: require content.manage
    if (subject === "category" || subject === "tag" || subject === "page") {
      return hasBlogPermission("content.manage");
    }

    // Dashboard overview
    if (subject === "dashboard") {
      return (
        hasBlogPermission("content.manage") ||
        hasBlogPermission("content.author") ||
        hasBlogPermission("community.moderate") ||
        hasBlogPermission("site.manage") ||
        hasBlogPermission("members.manage") ||
        hasBlogPermission("ai.manage")
      );
    }

    // Post abilities
    if (subject === "post") {
      if (action === "create") {
        return (
          hasBlogPermission("content.author") ||
          hasBlogPermission("content.manage")
        );
      }
      if (action === "view" || action === "edit" || action === "restore") {
        if (hasBlogPermission("content.manage")) return true;
        if (hasBlogPermission("content.author")) {
          if (!resource) return true; // general capability
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId == null ||
            (currentPrincipalId != null && creatorId === currentPrincipalId)
          );
        }
        return false;
      }
      if (action === "delete" || action === "batch") {
        return hasBlogPermission("content.manage");
      }
    }

    // Media abilities
    if (subject === "media") {
      if (action === "create") {
        return (
          hasBlogPermission("content.author") ||
          hasBlogPermission("content.manage")
        );
      }
      if (action === "view" || action === "edit") {
        if (hasBlogPermission("content.manage")) return true;
        if (hasBlogPermission("content.author")) {
          if (!resource) return true;
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId == null ||
            (currentPrincipalId != null && creatorId === currentPrincipalId)
          );
        }
        return false;
      }
      if (action === "delete") {
        // Can only delete if reference count is 0
        const refCount =
          resource?.usage_count ?? resource?.references_count ?? 0;
        if (refCount > 0) return false;

        if (hasBlogPermission("content.manage")) return true;
        if (hasBlogPermission("content.author")) {
          if (!resource) return true;
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId == null ||
            (currentPrincipalId != null && creatorId === currentPrincipalId)
          );
        }
        return false;
      }
      if (action === "batch") {
        return hasBlogPermission("content.manage");
      }
    }

    return false;
  };

  return {
    can,
    cannot: (action, subject, resource) => !can(action, subject, resource),
    principalId: currentPrincipalId,
  };
}

export function useAbility(): AbilityChecker {
  return defineAbility();
}
