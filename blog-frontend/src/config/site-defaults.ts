import type { SiteSettings } from '../types/blog';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site_title: 'Gouno Blog',
  site_description: '记录、思考与分享。',
  author_name: '站点作者',
  author_bio: '欢迎来到我的博客。',
  email: '',
  github_url: '',
  rss_url: '/feed.xml',
  default_seo_title: 'Gouno Blog',
  default_seo_description: '记录、思考与分享。',
  footer_text: 'Built with care, code, and curiosity.',
  hero_title: '把复杂系统，\n写成可理解的路径。',
  hero_description: '关于工程架构、产品设计与 AI 实践的长期笔记。写清楚问题，也写清楚选择背后的理由。',
  hero_image_url: '/editorial-system-map.png',
  hero_image_caption: 'SYSTEMS / PEOPLE / DECISIONS',
};

export function authorInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '站点';
}
