import { apiClient } from "./client";

export interface AnalyticsSummary {
  pending_comments: number;
  reported_comments: number;
}

export const analyticsApi = {
  async getSummary(): Promise<AnalyticsSummary> {
    return apiClient.get<AnalyticsSummary>("/api/admin/analytics");
  },

  async recordView(slugOrID: string | number): Promise<void> {
    return apiClient.post<void>(
      `/api/posts/${encodeURIComponent(String(slugOrID))}/view`,
    );
  },
};
