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
};

export function authorInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '站点';
}
