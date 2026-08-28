import { apiClient } from "./client";
import { setCachedSiteSettings } from "../config/site-defaults";
import type { Category, SiteSettings } from "../types/blog";

export interface TagSummary {
  name: string;
  post_count: number;
}

export const siteApi = {
  async getSiteSettings(): Promise<SiteSettings> {
    const data = await apiClient.get<SiteSettings>("/api/site");
    if (data && typeof data === "object") setCachedSiteSettings(data);
    return data;
  },

  async getAdminSettings(): Promise<SiteSettings> {
    const data = await apiClient.get<SiteSettings>("/api/admin/settings");
    if (data && typeof data === "object") setCachedSiteSettings(data);
    return data;
  },

  async updateAdminSettings(
    settings: Record<string, string>,
  ): Promise<SiteSettings> {
    const data = await apiClient.put<SiteSettings>(
      "/api/admin/settings",
      settings,
    );
    if (data && typeof data === "object") setCachedSiteSettings(data);
    return data;
  },

  async updateSiteSettings(
    settings: Record<string, string>,
  ): Promise<SiteSettings> {
    return this.updateAdminSettings(settings);
  },

  async getCategories(): Promise<Category[]> {
    return apiClient.get<Category[]>("/api/categories");
  },

  async getAdminCategories(): Promise<Category[]> {
    return apiClient.get<Category[]>("/api/admin/categories");
  },

  async createCategory(category: Partial<Category>): Promise<Category> {
    return apiClient.post<Category>("/api/admin/categories", category);
  },

  async updateCategory(
    id: number | string,
    category: Partial<Category>,
  ): Promise<Category> {
    return apiClient.put<Category>(`/api/admin/categories/${id}`, category);
  },

  async deleteCategory(id: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/admin/categories/${id}`);
  },

  async getTags(): Promise<string[]> {
    return apiClient.get<string[]>("/api/tags");
  },

  async getPublishedTagSummaries(): Promise<TagSummary[]> {
    return apiClient.get<TagSummary[]>("/api/tags/summary");
  },

  async getAdminTags(): Promise<TagSummary[]> {
    return apiClient.get<TagSummary[]>("/api/admin/tags");
  },

  async renameTag(oldName: string, newName: string): Promise<void> {
    return apiClient.put<void>(
      `/api/admin/tags/${encodeURIComponent(oldName)}`,
      { name: newName },
    );
  },

  async mergeTags(source: string, target: string): Promise<void> {
    return apiClient.post<void>("/api/admin/tags/merge", {
      source,
      target,
    });
  },

  async deleteTag(name: string): Promise<void> {
    return apiClient.delete<void>(
      `/api/admin/tags/${encodeURIComponent(name)}`,
    );
  },
};
