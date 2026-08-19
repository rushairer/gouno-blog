import { apiFetch } from '../auth';
import { readData } from './client';
import type { CustomPage, PaginatedPages } from '../types/blog';

export const pagesApi = {
  async getPageBySlug(slug: string): Promise<CustomPage> {
    return readData<CustomPage>(apiFetch(`/api/pages/${encodeURIComponent(slug)}`));
  },

  async getNavPages(): Promise<CustomPage[]> {
    return readData<CustomPage[]>(apiFetch('/api/pages/nav'));
  },

  async getAdminPages(params?: { page?: number; pageSize?: number; q?: string; status?: string }): Promise<PaginatedPages> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    if (params?.q) search.set('q', params.q);
    if (params?.status) search.set('status', params.status);
    const query = search.toString();
    return readData<PaginatedPages>(apiFetch(`/api/admin/pages${query ? `?${query}` : ''}`));
  },

  async getAdminPage(id: number | string): Promise<CustomPage> {
    return readData<CustomPage>(apiFetch(`/api/admin/pages/${id}`));
  },

  async createPage(page: Partial<CustomPage>): Promise<CustomPage> {
    return readData<CustomPage>(
      apiFetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(page),
      })
    );
  },

  async updatePage(id: number | string, page: Partial<CustomPage>): Promise<CustomPage> {
    return readData<CustomPage>(
      apiFetch(`/api/admin/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(page),
      })
    );
  },

  async deletePage(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/pages/${id}`, {
        method: 'DELETE',
      })
    );
  },
};
