import { apiFetch } from '../auth';
import { readData } from './api-client';
import type { Category, CustomPage, PaginatedPages, PaginatedPosts, Post, SiteSettings } from '../types/blog';

export function getPosts(params: URLSearchParams, admin = false) {
  const path = admin ? '/api/admin/posts' : '/api/posts';
  const query = params.toString();
  return readData<PaginatedPosts>(apiFetch(`${path}${query ? `?${query}` : ''}`));
}

export function getPost(slugOrID: string) {
  return readData<Post>(apiFetch(`/api/posts/${encodeURIComponent(slugOrID)}`));
}

export function getCategories() {
  return readData<Category[]>(apiFetch('/api/categories'));
}

export function getCategoryPosts(slug: string, params: URLSearchParams) {
  const query = params.toString();
  return readData<PaginatedPosts>(apiFetch(`/api/categories/${encodeURIComponent(slug)}/posts${query ? `?${query}` : ''}`));
}

export function getTags() {
  return readData<string[]>(apiFetch('/api/tags'));
}

export function getSiteSettings() {
  return readData<SiteSettings>(apiFetch('/api/site'));
}

export function getPageBySlug(slug: string) {
  return readData<CustomPage>(apiFetch(`/api/pages/${encodeURIComponent(slug)}`));
}

export function getNavPages() {
  return readData<CustomPage[]>(apiFetch('/api/pages/nav'));
}

export function getAdminPages(params?: { page?: number; pageSize?: number; q?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  if (params?.q) search.set('q', params.q);
  if (params?.status) search.set('status', params.status);
  const query = search.toString();
  return readData<PaginatedPages>(apiFetch(`/api/admin/pages${query ? `?${query}` : ''}`));
}

export function getAdminPage(id: number | string) {
  return readData<CustomPage>(apiFetch(`/api/admin/pages/${id}`));
}

export function createPage(page: Partial<CustomPage>) {
  return readData<CustomPage>(apiFetch('/api/admin/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(page),
  }));
}

export function updatePage(id: number | string, page: Partial<CustomPage>) {
  return readData<CustomPage>(apiFetch(`/api/admin/pages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(page),
  }));
}

export function deletePage(id: number | string) {
  return readData<void>(apiFetch(`/api/admin/pages/${id}`, {
    method: 'DELETE',
  }));
}

export { readData };

