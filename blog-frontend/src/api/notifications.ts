import { apiClient } from "./client";

export interface Notification {
  id: number;
  type: string;
  post_id?: number;
  post_slug?: string;
  post_title?: string;
  comment_id?: number;
  actor_name?: string;
  title?: string;
  body?: string;
  href?: string;
  read_at?: string;
  created_at: string;
}

export const notificationsApi = {
  async getNotifications(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Notification[]; total: number }> {
    return apiClient.get<{ list: Notification[]; total: number }>(
      "/api/me/notifications",
      { params },
    );
  },

  async markRead(id: number | string): Promise<void> {
    return apiClient.put<void>(`/api/me/notifications/${id}/read`);
  },

  async markAllRead(): Promise<void> {
    return apiClient.put<void>("/api/me/notifications/read-all");
  },

  async deleteNotification(id: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/me/notifications/${id}`);
  },

  async deleteNotifications(ids: (number | string)[]): Promise<void> {
    return apiClient.post<void>("/api/me/notifications/batch-delete", {
      ids,
    });
  },

  async clearNotifications(
    onlyRead = false,
  ): Promise<{ deleted_count?: number }> {
    return apiClient.delete<{ deleted_count?: number }>(
      "/api/me/notifications",
      {
        params: onlyRead ? { only_read: "true" } : undefined,
      },
    );
  },
};
