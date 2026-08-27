/**
 * Runtime configuration defaults and threshold constants.
 */
export const PAGINATION_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  FEED_PAGE_SIZE: 10,
  ADMIN_PAGE_SIZE: 20,
  RUNS_PAGE_SIZE: 100,
} as const;

export const TIMEOUTS_MS = {
  COPY_FEEDBACK: 2000,
  TOAST_DEFAULT: 4000,
  WORKFLOW_POLL_INTERVAL: 2000,
  AUTO_SAVE_DEBOUNCE: 1800,
} as const;

export const AI_PROVIDER_DEFAULT_URLS = {
  OPENAI: "https://api.openai.com",
  OPENAI_V1: "https://api.openai.com/v1",
  GEMINI: "https://generativelanguage.googleapis.com",
  ANTHROPIC: "https://api.anthropic.com",
} as const;

export const SCHEMA_ORG_CONTEXT = "https://schema.org";
