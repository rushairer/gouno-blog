/**
 * Storage keys used across gouno-blog client application.
 * All keys are properly prefixed to avoid namespace collisions.
 */
export const STORAGE_KEYS = {
  THEME: "gouno-blog:theme",
  LOCALE: "gouno-blog:locale",
  SITE_SETTINGS: "gouno-blog:site-settings",
  POST_DRAFT_PREFIX: "gouno-blog:draft:post:",
  PAGE_DRAFT_PREFIX: "gouno-blog:draft:page:",
} as const;

export const SESSION_KEYS = {
  POST_VIEWED_PREFIX: "gouno-blog:viewed:",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS];
