/**
 * Domain enums and business status constants for gouno-blog.
 */
export const MembershipStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING: "pending",
  INACTIVE: "inactive",
} as const;

export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const RoleType = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  AUTHOR: "author",
  REVIEWER: "reviewer",
} as const;

export type RoleType = (typeof RoleType)[keyof typeof RoleType];

export function getBlogRoleLabel(role?: string): string {
  switch (role) {
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

export const PostStatus = {
  PUBLISHED: "published",
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  ARCHIVED: "archived",
} as const;

export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export const WorkflowRunStatus = {
  PENDING: "pending",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  WAITING: "waiting",
} as const;

export type WorkflowRunStatus =
  (typeof WorkflowRunStatus)[keyof typeof WorkflowRunStatus];
