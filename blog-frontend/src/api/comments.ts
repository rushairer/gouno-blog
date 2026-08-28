import { ApiError } from "@gosso/client";
import { apiClient } from "./client";
import type { Comment } from "../types/blog";

export interface CommunityComment extends Comment {
  author_type: "anonymous" | "user";
}

export interface PostCommentPayload {
  author?: string;
  content: string;
  parent_id?: number;
}

export const commentsApi = {
  async getPostComments(
    slugOrID: string | number,
  ): Promise<CommunityComment[]> {
    return apiClient.get<CommunityComment[]>(
      `/api/posts/${encodeURIComponent(String(slugOrID))}/comments`,
    );
  },

  async getAllPostComments(postID: number | string): Promise<Comment[]> {
    return apiClient.get<Comment[]>(`/api/posts/${postID}/comments/all`);
  },

  async getAdminComments(params?: {
    status?: string;
    reported?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<CommunityComment[]> {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params?.status) cleanParams.status = params.status;
    if (params?.reported) cleanParams.reported = true;
    if (params?.page) cleanParams.page = params.page;
    if (params?.pageSize) cleanParams.pageSize = params.pageSize;

    const result = await apiClient.get<unknown>("/api/admin/comments", {
      params: cleanParams,
    });
    if (Array.isArray(result)) return result as CommunityComment[];
    if (
      result &&
      typeof result === "object" &&
      "list" in result &&
      Array.isArray((result as { list: unknown }).list)
    ) {
      return (result as { list: CommunityComment[] }).list;
    }
    return [];
  },

  async postComment(
    slugOrID: string | number,
    payload: PostCommentPayload,
  ): Promise<CommunityComment> {
    return apiClient.post<CommunityComment>(
      `/api/posts/${encodeURIComponent(String(slugOrID))}/comments`,
      payload,
    );
  },

  async moderateComment(
    commentID: number | string,
    status: "visible" | "hidden" | "pending",
  ): Promise<void> {
    return apiClient.put<void>(`/api/admin/comments/${commentID}`, {
      status,
    });
  },

  async deleteComment(commentID: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/comments/${commentID}`);
  },

  async reportComment(
    commentID: number | string,
    reason: string,
  ): Promise<"submitted" | "already-reported"> {
    try {
      await apiClient.post<void>(`/api/comments/${commentID}/report`, {
        reason,
      });
      return "submitted";
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        return "already-reported";
      }
      throw err;
    }
  },

  async setLike(
    slugOrID: string | number,
    liked: boolean,
  ): Promise<{ liked: boolean; likes_count: number }> {
    const url = `/api/posts/${encodeURIComponent(String(slugOrID))}/like`;
    if (liked) {
      return apiClient.put<{ liked: boolean; likes_count: number }>(url);
    }
    return apiClient.delete<{ liked: boolean; likes_count: number }>(url);
  },
};
