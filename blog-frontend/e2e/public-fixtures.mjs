export const publicSiteSettings = {
  site_title: "Browser Acceptance Blog",
  site_description: "Rendered public Blog acceptance fixture",
  author_name: "Visual Reviewer",
  author_bio: "记录工程实践、架构选择与长期复盘。",
  email: "visual-reviewer@example.test",
  github_url: "https://github.com/rushairer/gouno-blog",
  rss_url: "/rss.xml",
  default_seo_title: "Browser Acceptance Blog",
  default_seo_description: "Rendered public Blog acceptance fixture",
  footer_text: "Public Blog rendered acceptance fixture",
  hero_title: "把复杂系统讲清楚，也把长期选择留下来",
  hero_description:
    "这里记录架构、产品与工程实践中的问题、取舍和可复用结论。",
  hero_image_url: "/browser-acceptance.svg",
  hero_image_caption: "Browser Acceptance fixture",
  favicon_url: "",
};

export const publicCategories = [
  {
    id: 1,
    name: "工程实践",
    slug: "engineering",
    description: "从实现细节回到长期可维护的工程选择。",
    sort_order: 1,
    post_count: 4,
  },
  {
    id: 2,
    name: "架构设计",
    slug: "architecture",
    description: "边界、契约、所有权与演进路径。",
    sort_order: 2,
    post_count: 3,
  },
  {
    id: 3,
    name: "产品复盘",
    slug: "product-review",
    description: "把产品决策、数据与结果放在同一张图上复盘。",
    sort_order: 3,
    post_count: 2,
  },
];

export const publicTags = [
  "OAuth2",
  "React",
  "Go",
  "Architecture",
  "Design System",
];

const categoryBySlug = Object.fromEntries(
  publicCategories.map((category) => [category.slug, category]),
);

const makePost = ({
  id,
  title,
  slug,
  summary,
  tags,
  category,
  day,
  content,
}) => ({
  id,
  title,
  slug,
  summary,
  content:
    content ||
    `## 背景\n\n${summary}\n\n## 关键选择\n\n保持边界清晰，让实现细节服从长期所有权。\n\n## 结果\n\n把一次性的修补收敛成可重复验证的工程约束。`,
  tags,
  status: "published",
  category: categoryBySlug[category],
  category_id: categoryBySlug[category].id,
  cover_url: id === 1 ? "/browser-acceptance.svg" : "",
  cover_alt: id === 1 ? "Browser Acceptance article cover" : "",
  views_count: 100 + id,
  likes_count: 10 + id,
  published_at: `2026-09-${String(day).padStart(2, "0")}T08:00:00Z`,
  created_at: `2026-09-${String(day).padStart(2, "0")}T08:00:00Z`,
  updated_at: `2026-09-${String(day).padStart(2, "0")}T09:00:00Z`,
});

export const publicPosts = [
  makePost({
    id: 1,
    title: "OAuth2 与 BFF：把浏览器边界重新画清楚",
    slug: "canonical-oauth2",
    summary: "从授权码、PKCE 到 BFF 会话，重新确认浏览器真正应该持有什么。",
    tags: ["OAuth2", "Architecture"],
    category: "engineering",
    day: 13,
    content:
      "## 为什么重新画边界\n\n浏览器只持有本域业务会话，令牌交换与刷新留在可信后端。\n\n## 请求路径\n\n```text\nBrowser -> BFF -> Authorization Server -> Resource Server\n```\n\n## 一个刻意很长的不可分割标识\n\n`capability-contract-browser-acceptance-very-long-token-that-must-never-break-the-page-level-responsive-layout-20260914`\n\n## 收口标准\n\n边界可解释、失败可恢复、行为可通过自动化浏览器重复证明。",
  }),
  makePost({
    id: 2,
    title: "React 页面如何避免历史 CSS 污染",
    slug: "react-css-ownership",
    summary: "把 primitive、composition 和 product-owned styles 的职责重新分层。",
    tags: ["React", "Design System"],
    category: "engineering",
    day: 12,
  }),
  makePost({
    id: 3,
    title: "Capability-first 架构里的事务所有权",
    slug: "capability-transaction-ownership",
    summary: "跨 Capability 协作时，事务边界应该由应用协调层显式持有。",
    tags: ["Go", "Architecture"],
    category: "architecture",
    day: 11,
  }),
  makePost({
    id: 4,
    title: "Design System 不是一套 CSS 文件",
    slug: "design-system-contracts",
    summary: "真正的设计系统需要组件所有权、契约、示例和防回流门禁。",
    tags: ["Design System", "React"],
    category: "architecture",
    day: 10,
  }),
  makePost({
    id: 5,
    title: "从一次 UI 漂移到可重复验收",
    slug: "rendered-acceptance",
    summary: "把主观视觉走查转换成跨视口、跨主题的 rendered acceptance。",
    tags: ["React", "Design System"],
    category: "product-review",
    day: 9,
  }),
  makePost({
    id: 6,
    title: "Go 服务边界为什么需要窄 Contract",
    slug: "go-narrow-contracts",
    summary: "跨模块只暴露消费者真正需要的能力，减少隐式耦合。",
    tags: ["Go", "Architecture"],
    category: "architecture",
    day: 8,
  }),
];

export const publicTagSummaries = publicTags.map((name) => ({
  name,
  post_count: publicPosts.filter((post) => post.tags.includes(name)).length,
}));

export const publicComment = {
  id: 101,
  post_id: 1,
  author: "Fixture Reader",
  author_type: "user",
  content: "这条评论用于验证文章社区区块在真实浏览器中的布局。",
  status: "visible",
  is_visible: true,
  report_count: 0,
  created_at: "2026-09-13T10:00:00Z",
};

export const publicNotifications = [
  {
    id: 301,
    type: "reply",
    post_id: 1,
    post_slug: "canonical-oauth2",
    post_title: "OAuth2 与 BFF：把浏览器边界重新画清楚",
    comment_id: 101,
    actor_name: "Fixture Reader",
    title: "Fixture Reader 回复了你的评论",
    body: "这条通知用于验证 Account Notifications 的已读状态与窄屏布局。",
    href: "/articles/canonical-oauth2#comment-101",
    created_at: "2026-09-14T09:00:00Z",
  },
  {
    id: 302,
    type: "system",
    title: "站点事件通知",
    body: "这是一条已读的确定性浏览器 Fixture 通知。",
    href: "/account/settings",
    read_at: "2026-09-14T08:00:00Z",
    created_at: "2026-09-14T08:00:00Z",
  },
];

export const aboutPage = {
  id: 201,
  title: "关于",
  slug: "about",
  summary: "关于这个站点，以及持续写作的理由。",
  content:
    "这里用于记录值得长期保存的问题、过程与结论。\n\n## 写作原则\n\n真实、可验证、保留上下文。",
  template: "about",
  status: "published",
  allow_comments: false,
  show_in_nav: true,
  sort_order: 10,
  created_at: "2026-09-01T08:00:00Z",
};

export const linksPage = {
  id: 202,
  title: "常用链接",
  slug: "links",
  summary: "项目、文档与长期维护入口。",
  content:
    "- [Gouno Blog](https://github.com/rushairer/gouno-blog)\n- [Gouno UI](https://github.com/rushairer/gouno-ui)",
  template: "links",
  status: "published",
  allow_comments: false,
  show_in_nav: true,
  sort_order: 20,
  created_at: "2026-09-01T08:00:00Z",
};

export const publicNavPages = [aboutPage, linksPage];
