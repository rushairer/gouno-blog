import { authenticatedApiFetch as apiFetch, optionalApiFetch, publicApiFetch, readData } from './client';
import type { PaginatedPosts, Post, PostVersion } from '../types/blog';

export interface PostPayload {
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  tags?: string[];
  status?: 'draft' | 'scheduled' | 'published';
  scheduled_at?: string;
}

export const postsApi = {
  async getPosts(params?: URLSearchParams | Record<string, string | number>, admin = false): Promise<PaginatedPosts> {
    const path = admin ? '/api/admin/posts' : '/api/posts';
    let query = '';
    if (params) {
      if (params instanceof URLSearchParams) {
        query = params.toString();
      } else {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') {
            if (admin && k === 'search' && !params.q) {
              search.set('q', String(v));
            } else {
              search.set(k, String(v));
            }
          }
        });
        query = search.toString();
      }
    }
    return readData<PaginatedPosts>(apiFetch(`${path}${query ? `?${query}` : ''}`));
  },

  async getPost(slugOrID: string | number): Promise<Post> {
    return readData<Post>(publicApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}`));
  },

  async getAdminPost(slugOrID: number | string): Promise<Post> {
    return readData<Post>(apiFetch(`/api/admin/posts/${encodeURIComponent(String(slugOrID))}`));
  },

  async getRelatedPosts(slugOrID: string | number): Promise<Post[]> {
    return (await readData<Post[] | null>(publicApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/related`))) || [];
  },

  async getCommunityState(slugOrID: string | number): Promise<{ liked: boolean; bookmarked: boolean; likes_count: number }> {
    return readData<{ liked: boolean; bookmarked: boolean; likes_count: number }>(
      optionalApiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/community`)
    );
  },

  async createPost(payload: PostPayload): Promise<Post> {
    return readData<Post>(
      apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  async updatePost(id: number | string, payload: PostPayload): Promise<Post> {
    return readData<Post>(
      apiFetch(`/api/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  async deletePost(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/posts/${id}`, {
        method: 'DELETE',
      })
    );
  },

  async getVersions(postID: number | string): Promise<PostVersion[]> {
    return readData<PostVersion[]>(apiFetch(`/api/admin/posts/${postID}/versions`));
  },

  async restoreVersion(postID: number | string, versionID: number | string): Promise<Post> {
    return readData<Post>(
      apiFetch(`/api/admin/posts/${postID}/versions/${versionID}/restore`, {
        method: 'POST',
      })
    );
  },

  async getCategoryPosts(slug: string, params?: URLSearchParams | Record<string, string | number>): Promise<PaginatedPosts> {
    let query = '';
    if (params) {
      query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params as Record<string, string>).toString();
    }
    return readData<PaginatedPosts>(apiFetch(`/api/categories/${encodeURIComponent(slug)}/posts${query ? `?${query}` : ''}`));
  },

  async batchAction(ids: (number | string)[], action: 'publish' | 'draft' | 'delete'): Promise<void> {
    return readData<void>(
      apiFetch('/api/admin/posts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
    );
  },
};
