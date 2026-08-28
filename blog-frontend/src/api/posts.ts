import { apiClient } from "./client";
import type { PaginatedPosts, Post, PostVersion } from "../types/blog";

export interface PostPayload {
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  tags?: string[];
  status?: "draft" | "scheduled" | "published";
  scheduled_at?: string;
}

export const postsApi = {
  async getPosts(
    params?: URLSearchParams | Record<string, string | number>,
    admin = false,
  ): Promise<PaginatedPosts> {
    const path = admin ? "/api/admin/posts" : "/api/posts";
    const cleanParams: Record<string, string | number> = {};
    if (params && !(params instanceof URLSearchParams)) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") {
          if (admin && k === "search" && !params.q) {
            cleanParams.q = v;
          } else {
            cleanParams[k] = v;
          }
        }
      });
    }
    return apiClient.get<PaginatedPosts>(path, {
      params: params instanceof URLSearchParams ? params : cleanParams,
    });
  },

  async getPost(slugOrID: string | number): Promise<Post> {
    return apiClient.get<Post>(
      `/api/posts/${encodeURIComponent(String(slugOrID))}`,
    );
  },

  async getAdminPost(slugOrID: number | string): Promise<Post> {
    return apiClient.get<Post>(
      `/api/admin/posts/${encodeURIComponent(String(slugOrID))}`,
    );
  },

  async getRelatedPosts(slugOrID: string | number): Promise<Post[]> {
    return (
      (await apiClient.get<Post[] | null>(
        `/api/posts/${encodeURIComponent(String(slugOrID))}/related`,
      )) || []
    );
  },

  async getCommunityState(
    slugOrID: string | number,
  ): Promise<{ liked: boolean; likes_count: number }> {
    return apiClient.get<{ liked: boolean; likes_count: number }>(
      `/api/posts/${encodeURIComponent(String(slugOrID))}/community`,
    );
  },

  async createPost(payload: PostPayload): Promise<Post> {
    return apiClient.post<Post>("/api/posts", payload);
  },

  async updatePost(id: number | string, payload: PostPayload): Promise<Post> {
    return apiClient.put<Post>(`/api/posts/${id}`, payload);
  },

  async deletePost(id: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/posts/${id}`);
  },

  async getVersions(postID: number | string): Promise<PostVersion[]> {
    return apiClient.get<PostVersion[]>(`/api/admin/posts/${postID}/versions`);
  },

  async restoreVersion(
    postID: number | string,
    versionID: number | string,
  ): Promise<Post> {
    return apiClient.post<Post>(
      `/api/admin/posts/${postID}/versions/${versionID}/restore`,
    );
  },

  async getCategoryPosts(
    slug: string,
    params?: URLSearchParams | Record<string, string | number>,
  ): Promise<PaginatedPosts> {
    return apiClient.get<PaginatedPosts>(
      `/api/categories/${encodeURIComponent(slug)}/posts`,
      { params },
    );
  },

  async batchAction(
    ids: (number | string)[],
    action: "publish" | "draft" | "delete",
  ): Promise<void> {
    return apiClient.post<void>("/api/admin/posts/batch", { ids, action });
  },
};
