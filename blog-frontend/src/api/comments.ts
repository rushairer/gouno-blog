import { apiFetch } from '../auth';
import { readData } from './client';
import type { Comment } from '../types/blog';
import type { CommunityComment } from '../community';

export interface PostCommentPayload {
  author?: string;
  content: string;
  parent_id?: number;
}

export const commentsApi = {
  async getPostComments(slugOrID: string | number): Promise<Comment[]> {
    return readData<Comment[]>(apiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/comments`));
  },

  async getAllPostComments(postID: number | string): Promise<Comment[]> {
    return readData<Comment[]>(apiFetch(`/api/posts/${postID}/comments/all`));
  },

  async getAdminComments(params?: { status?: string; reported?: boolean; page?: number; pageSize?: number }): Promise<CommunityComment[]> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.reported) search.set('reported', 'true');
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const query = search.toString();
    const result = await readData<CommunityComment[] | { list: CommunityComment[] }>(
      apiFetch(`/api/admin/comments${query ? `?${query}` : ''}`)
    );
    if (result && typeof result === 'object' && 'list' in result) {
      return result.list || [];
    }
    return (result as CommunityComment[]) || [];
  },

  async postComment(slugOrID: string | number, payload: PostCommentPayload): Promise<Comment> {
    return readData<Comment>(
      apiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  async toggleCommentVisibility(commentID: number | string, isVisible: boolean): Promise<void> {
    return readData<void>(
      apiFetch(`/api/comments/${commentID}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_visible: isVisible }),
      })
    );
  },

  async moderateComment(commentID: number | string, status: 'visible' | 'hidden' | 'pending'): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/comments/${commentID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    );
  },

  async deleteComment(commentID: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/comments/${commentID}`, {
        method: 'DELETE',
      })
    );
  },

  async reportComment(commentID: number | string, reason: string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/comments/${commentID}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
    );
  },

  async setLike(slugOrID: string | number, liked: boolean): Promise<{ liked: boolean; likes_count: number }> {
    return readData<{ liked: boolean; likes_count: number }>(
      apiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked }),
      })
    );
  },
};
