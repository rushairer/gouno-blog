export { optionalApiFetch, readData as readResponse } from './lib/api-client';

export interface CommunityComment {
  id: number;
  post_id: number;
  parent_id?: number;
  author: string;
  author_type: 'anonymous' | 'user';
  content: string;
  status: 'pending' | 'visible' | 'hidden';
  is_visible: boolean;
  report_count?: number;
  created_at: string;
}

export interface Notification {
  id: number;
  type: 'comment_reply';
  post_id?: number;
  post_slug: string;
  post_title: string;
  comment_id?: number;
  actor_name: string;
  title?: string;
  body?: string;
  href?: string;
  read_at?: string;
  created_at: string;
}
