import { useUserProfile } from "@gosso/client/react";
import type { BlogUserProfile } from "../auth";
import { MembershipStatus } from "../constants";
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

export function isActiveMember(profile: BlogUserProfile | null): boolean {
  return Boolean(
    profile &&
    (!profile.membership_status ||
      profile.membership_status === MembershipStatus.ACTIVE),
  );
}

export function canPreviewUnpublished(
  profile: BlogUserProfile | null,
): boolean {
  return isActiveMember(profile) && Boolean(profile?.roles?.length);
}

export function defineAbility(session: BlogUserProfile | null): AbilityChecker {
  const currentPrincipalId = session?.principal?.id ?? null;
  const activeMember = isActiveMember(session);
  const permissions = Array.isArray(session?.permissions)
    ? session.permissions
    : [];
  const hasPerm = (p: string) => {
    if (!activeMember) return false;
    return permissions.includes(p);
  };

  const can = (
    action: AbilityAction,
    subject: AbilitySubject,
    resource?: any,
  ): boolean => {
    if (!activeMember) return false;

    // Site / Members / AI
    if (subject === "site") return hasPerm("site.manage");
    if (subject === "members") return hasPerm("members.manage");
    if (subject === "ai") {
      if (action === "create" || action === "view" || action === "edit") {
        return (
          hasPerm("content.author") ||
          hasPerm("content.manage") ||
          hasPerm("ai.manage")
        );
      }
      return hasPerm("ai.manage");
    }
    if (subject === "comment" || action === "moderate") {
      return hasPerm("community.moderate");
    }

    // Categories, Tags, Pages: require content.manage
    if (subject === "category" || subject === "tag" || subject === "page") {
      return hasPerm("content.manage");
    }

    // Dashboard overview
    if (subject === "dashboard") {
      return (
        hasPerm("content.manage") ||
        hasPerm("content.author") ||
        hasPerm("community.moderate") ||
        hasPerm("site.manage") ||
        hasPerm("members.manage") ||
        hasPerm("ai.manage")
      );
    }

    // Post abilities
    if (subject === "post") {
      if (action === "create" || action === "view") {
        return hasPerm("content.author") || hasPerm("content.manage");
      }
      if (action === "edit" || action === "restore") {
        if (hasPerm("content.manage")) return true;
        if (hasPerm("content.author")) {
          if (!resource) return true; // general capability
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId != null &&
            currentPrincipalId != null &&
            creatorId === currentPrincipalId
          );
        }
        return false;
      }
      if (action === "delete" || action === "batch") {
        return hasPerm("content.manage");
      }
    }

    // Media abilities
    if (subject === "media") {
      if (action === "create" || action === "view") {
        return hasPerm("content.author") || hasPerm("content.manage");
      }
      if (action === "edit") {
        if (hasPerm("content.manage")) return true;
        if (hasPerm("content.author")) {
          if (!resource) return true;
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId != null &&
            currentPrincipalId != null &&
            creatorId === currentPrincipalId
          );
        }
        return false;
      }
      if (action === "delete") {
        // Can only delete if reference count is 0
        const refCount =
          resource?.usage_count ?? resource?.references_count ?? 0;
        if (refCount > 0) return false;

        if (hasPerm("content.manage")) return true;
        if (hasPerm("content.author")) {
          if (!resource) return true;
          const creatorId = resource.created_by_principal_id;
          return (
            creatorId != null &&
            currentPrincipalId != null &&
            creatorId === currentPrincipalId
          );
        }
        return false;
      }
      if (action === "batch") {
        return hasPerm("content.manage");
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
  const profile = useUserProfile<BlogUserProfile>();
  return defineAbility(profile);
}
