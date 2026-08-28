import { apiClient } from "./client";
import type { CustomPage, PaginatedPages } from "../types/blog";

export const pagesApi = {
  async getPageBySlug(slug: string): Promise<CustomPage> {
    return apiClient.get<CustomPage>(`/api/pages/${encodeURIComponent(slug)}`);
  },

  async getNavPages(): Promise<CustomPage[]> {
    return apiClient.get<CustomPage[]>("/api/pages/nav");
  },

  async getAdminPages(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: string;
  }): Promise<PaginatedPages> {
    return apiClient.get<PaginatedPages>("/api/admin/pages", {
      params,
    });
  },

  async getAdminPage(id: number | string): Promise<CustomPage> {
    return apiClient.get<CustomPage>(`/api/admin/pages/${id}`);
  },

  async createPage(page: Partial<CustomPage>): Promise<CustomPage> {
    return apiClient.post<CustomPage>("/api/admin/pages", page);
  },

  async updatePage(
    id: number | string,
    page: Partial<CustomPage>,
  ): Promise<CustomPage> {
    return apiClient.put<CustomPage>(`/api/admin/pages/${id}`, page);
  },

  async deletePage(id: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/admin/pages/${id}`);
  },
};
