import { apiFetch } from '../auth';
import { readData } from './client';

export interface AnalyticsSummary {
  bookmarks: number;
  pending_comments: number;
  reported_comments: number;
}

export const analyticsApi = {
  async getSummary(): Promise<AnalyticsSummary> {
    return readData<AnalyticsSummary>(apiFetch('/api/admin/analytics'));
  },

  async recordView(slugOrID: string | number): Promise<void> {
    return readData<void>(
      apiFetch(`/api/posts/${encodeURIComponent(String(slugOrID))}/view`, {
        method: 'POST',
      })
    );
  },
};
