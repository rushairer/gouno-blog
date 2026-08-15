import { apiFetch } from '../auth';
import { readData } from './api-client';
import type { Category, PaginatedPosts, Post, SiteSettings } from '../types/blog';

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

export { readData };
