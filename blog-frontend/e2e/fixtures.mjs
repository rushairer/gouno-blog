export const siteSettings = {
  site_title: "Browser Acceptance Blog",
  site_description: "Rendered acceptance fixture",
  author_name: "Visual Reviewer",
  author_bio: "Rendered acceptance fixture",
  email: "visual-reviewer@example.test",
  github_url: "https://github.com/rushairer/gouno-blog",
  rss_url: "/rss.xml",
  default_seo_title: "Browser Acceptance Blog",
  default_seo_description: "Rendered acceptance fixture",
  footer_text: "Rendered acceptance fixture",
  hero_title: "Browser Acceptance Blog",
  hero_description: "Rendered acceptance fixture",
  hero_image_url: "",
  hero_image_caption: "",
  favicon_url: "",
};

export const category = {
  id: 1,
  name: "Browser Acceptance Category",
  slug: "browser-acceptance",
  description: "Rendered acceptance fixture",
  sort_order: 1,
  post_count: 1,
};

export const tag = { name: "BrowserAcceptance", post_count: 1 };

export const comment = {
  id: 1,
  post_id: 1,
  author: "Fixture Reader",
  author_type: "user",
  content: "Browser Acceptance Comment",
  status: "pending",
  is_visible: false,
  report_count: 0,
  created_at: "2026-09-13T10:00:00Z",
};

export const notification = {
  id: 1,
  type: "comment_created",
  title: "Browser Acceptance Notification",
  body: "Rendered notification fixture",
  href: "/admin/comments",
  read_at: "",
  created_at: "2026-09-13T10:00:00Z",
};

export const mediaItem = {
  id: 1,
  filename: "browser-acceptance.svg",
  storage_name: "browser-acceptance.svg",
  url: "/browser-acceptance.svg",
  content_type: "image/svg+xml",
  size_bytes: 128,
  alt_text: "Browser Acceptance Media",
  created_by: "Visual Reviewer",
  created_by_principal_id: 1,
  created_at: "2026-09-13T10:00:00Z",
  usage_count: 0,
  references_count: 0,
};

export const member = {
  principal: {
    id: 2,
    issuer: "http://127.0.0.1:4173",
    subject: "browser-acceptance-member",
    display_name: "Fixture Member",
    email: "fixture-member@example.test",
  },
  membership_status: "active",
  roles: ["author"],
  permissions: ["content.author"],
};
