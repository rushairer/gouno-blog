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
}

