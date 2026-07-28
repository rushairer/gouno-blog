import { apiFetch, isLoggedIn } from './auth';

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
  post_id: number;
  post_slug: string;
  post_title: string;
  comment_id?: number;
  actor_name: string;
  read_at?: string;
  created_at: string;
}

export async function optionalApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return isLoggedIn() ? apiFetch(input.toString(), init) : fetch(input, init);
}

export async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || body.error || 'Request failed');
  }
  return body.data as T;
}
