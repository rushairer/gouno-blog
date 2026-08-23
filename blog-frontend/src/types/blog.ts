export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  sort_order?: number;
  post_count?: number;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  status?: PostStatus;
  category?: Category | null;
  category_id?: number | null;
  cover_url?: string;
  cover_alt?: string;
  seo_title?: string;
  seo_description?: string;
  views_count?: number;
  likes_count?: number;
  published_at?: string;
  scheduled_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface PostVersion {
  id: number;
  post_id: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  status: PostStatus;
  scheduled_at?: string;
  created_at: string;
}

export interface Comment {
  id: number;
  post_id: number;
  parent_id?: number;
  author: string;
  author_type?: 'anonymous' | 'user';
  content: string;
  status: 'pending' | 'visible' | 'hidden' | string;
  is_visible: boolean;
  report_count?: number;
  created_at: string;
}

export interface PaginatedPosts {
  list: Post[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface SiteSettings {
  site_title: string;
  site_description: string;
  author_name: string;
  author_bio: string;
  email: string;
  github_url: string;
  rss_url: string;
  default_seo_title: string;
  default_seo_description: string;
  footer_text?: string;
  hero_title?: string;
  hero_description?: string;
  hero_image_url?: string;
  hero_image_caption?: string;
  favicon_url?: string;
}

export type PageTemplate = 'default' | 'about' | 'links' | 'blank' | 'timeline' | 'projects' | 'focus' | 'faq';

export interface CustomPage {
  id: number;
  title: string;
  slug: string;
  content: string;
  summary: string;
  template: PageTemplate;
  status: PostStatus;
  allow_comments: boolean;
  show_in_nav: boolean;
  sort_order: number;
  seo_title?: string;
  seo_description?: string;
  created_at: string;
  updated_at?: string;
}

export interface PaginatedPages {
  list: CustomPage[];
  total: number;
  page?: number;
  page_size?: number;
}
