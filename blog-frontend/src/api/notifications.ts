import { authenticatedApiFetch as apiFetch, readData } from './client';

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
  async getNotifications(params?: { page?: number; pageSize?: number }): Promise<{ list: Notification[]; total: number }> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const query = search.toString();
    return readData<{ list: Notification[]; total: number }>(apiFetch(`/api/me/notifications${query ? `?${query}` : ''}`));
  },

  async markRead(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/me/notifications/${id}/read`, {
        method: 'PUT',
      })
    );
  },

  async markAllRead(): Promise<void> {
    return readData<void>(
      apiFetch('/api/me/notifications/read-all', {
        method: 'PUT',
      })
    );
  },

  async deleteNotification(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/me/notifications/${id}`, {
        method: 'DELETE',
      })
    );
  },

  async deleteNotifications(ids: (number | string)[]): Promise<void> {
    return readData<void>(
      apiFetch('/api/me/notifications/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    );
  },

  async clearNotifications(onlyRead = false): Promise<{ deleted_count?: number }> {
    const query = onlyRead ? '?only_read=true' : '';
    return readData<{ deleted_count?: number }>(
      apiFetch(`/api/me/notifications${query}`, {
        method: 'DELETE',
      })
    );
  },
};
