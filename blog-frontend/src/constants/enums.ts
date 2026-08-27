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
