import { apiFetch } from '../auth';
import { readData } from './client';
import type { Notification } from '../community';

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

  async clearNotifications(readOnly = false): Promise<{ deleted: number }> {
    const query = readOnly ? '?read_only=true' : '';
    return readData<{ deleted: number }>(
      apiFetch(`/api/me/notifications/clear${query}`, {
        method: 'DELETE',
      })
    );
  },
};
