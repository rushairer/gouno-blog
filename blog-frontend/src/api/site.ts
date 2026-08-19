import { apiFetch } from '../auth';
import { readData } from './client';
import type { Category, SiteSettings } from '../types/blog';

export interface TagSummary {
  name: string;
  post_count: number;
}

export const siteApi = {
  async getSiteSettings(): Promise<SiteSettings> {
    return readData<SiteSettings>(apiFetch('/api/site'));
  },

  async getAdminSettings(): Promise<SiteSettings> {
    return readData<SiteSettings>(apiFetch('/api/admin/settings'));
  },

  async updateAdminSettings(settings: Record<string, string>): Promise<SiteSettings> {
    return readData<SiteSettings>(
      apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
    );
  },

  async updateSiteSettings(settings: Record<string, string>): Promise<SiteSettings> {
    return readData<SiteSettings>(
      apiFetch('/api/admin/site', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
    );
  },

  async getCategories(): Promise<Category[]> {
    return readData<Category[]>(apiFetch('/api/categories'));
  },

  async getAdminCategories(): Promise<Category[]> {
    return readData<Category[]>(apiFetch('/api/admin/categories'));
  },

  async createCategory(category: Partial<Category>): Promise<Category> {
    return readData<Category>(
      apiFetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(category),
      })
    );
  },

  async updateCategory(id: number | string, category: Partial<Category>): Promise<Category> {
    return readData<Category>(
      apiFetch(`/api/admin/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(category),
      })
    );
  },

  async deleteCategory(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/categories/${id}`, {
        method: 'DELETE',
      })
    );
  },

  async getTags(): Promise<string[]> {
    return readData<string[]>(apiFetch('/api/tags'));
  },

  async getAdminTags(): Promise<TagSummary[]> {
    return readData<TagSummary[]>(apiFetch('/api/admin/tags'));
  },

  async renameTag(oldName: string, newName: string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/tags/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
    );
  },

  async mergeTags(source: string, target: string): Promise<void> {
    return readData<void>(
      apiFetch('/api/admin/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, target }),
      })
    );
  },

  async deleteTag(name: string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/tags/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
    );
  },
};
