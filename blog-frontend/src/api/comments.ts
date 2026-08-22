import { authenticatedApiFetch as apiFetch, optionalApiFetch, publicApiFetch, readData } from './client';
import type { Comment } from '../types/blog';

export interface CommunityComment extends Comment {
  author_type: 'anonymous' | 'user';
}

export interface PostCommentPayload {
  author?: string;
  content: string;
  parent_id?: number;
}

export const commentsApi = {
  async getPostComments(slugOrID: string | number): Promise<CommunityComment[]> {
    return readData<CommunityComment[]>(publicApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/comments`));
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
    const result = await readData<unknown>(
      apiFetch(`/api/admin/comments${query ? `?${query}` : ''}`)
    );
    if (Array.isArray(result)) return result as CommunityComment[];
    if (result && typeof result === 'object' && 'list' in result && Array.isArray((result as { list: unknown }).list)) {
      return (result as { list: CommunityComment[] }).list;
    }
    return [];
  },

  async postComment(slugOrID: string | number, payload: PostCommentPayload): Promise<CommunityComment> {
    return readData<CommunityComment>(
      optionalApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  async reportComment(commentID: number | string, reason: string): Promise<'submitted' | 'already-reported'> {
    const response = await optionalApiFetch(`/api/comments/${commentID}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });
    if (response.status === 409) return 'already-reported';
    await readData<void>(response);
    return 'submitted';
  },

  async setLike(slugOrID: string | number, liked: boolean): Promise<{ liked: boolean; likes_count: number }> {
    return readData<{ liked: boolean; likes_count: number }>(
      optionalApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/like`, {
        method: liked ? 'PUT' : 'DELETE',
      })
    );
  },
};
