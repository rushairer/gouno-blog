export const dashboardSummary = {
  total_posts: 6,
  published_posts: 4,
  total_views: 28134,
  total_likes: 921,
  total_comments: 148,
  pending_comments: 3,
  reported_items: 1,
  top_posts: [
    {
      id: 101,
      title: "Browser Acceptance Post",
      slug: "browser-acceptance-post",
      views_count: 12840,
      likes_count: 421,
      created_by_principal_id: 1,
    },
  ],
  daily_events: [
    { date: "2026-09-12", count: 218 },
    { date: "2026-09-13", count: 274 },
    { date: "2026-09-14", count: 301 },
  ],
  ai_alerts: [
    {
      id: 77,
      type: "ai_workflow_failed",
      title: "Fixture Workflow failed",
      body: "Rendered browser evidence for the dashboard alert surface.",
      href: "/admin/ai-ops?tab=records&record=workflow&run=77",
      created_at: "2026-09-14T10:00:00Z",
    },
  ],
};

export const adminPost = {
  revision: 3,
  id: 101,
  title: "Browser Acceptance Post",
  slug: "browser-acceptance-post",
  summary: "Deterministic core Admin fixture",
  content: "# Browser Acceptance\n\nThis is a deterministic editor fixture with enough content to render the canonical workspace.\n\n```go\nfunc main() {}\n```",
  tags: ["Parity", "Browser"],
  status: "published",
  category: {
    id: 1,
    name: "Browser Acceptance Category",
    slug: "browser-acceptance",
  },
  category_id: 1,
  views_count: 12840,
  likes_count: 421,
  created_by_principal_id: 1,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-14T10:00:00Z",
};

export const adminPostVersion = {
  ...adminPost,
  id: 11,
  post_id: 101,
  status: "draft",
  created_at: "2026-09-13T10:00:00Z",
};

export const adminPage = {
  id: 201,
  title: "Browser Acceptance Page",
  slug: "browser-acceptance-page",
  content: "# Browser Acceptance Page\n\nDeterministic page editor content.",
  summary: "Deterministic page fixture",
  template: "default",
  status: "published",
  allow_comments: true,
  show_in_nav: true,
  sort_order: 1,
  seo_title: "Browser Acceptance Page",
  seo_description: "Rendered parity fixture",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-14T10:00:00Z",
};
