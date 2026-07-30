import { apiFetch } from '../auth';
import type { Category, PaginatedPosts, Post, SiteSettings } from '../types/blog';

async function readData<T>(response: Response | Promise<Response>): Promise<T> {
  const resolved = await response;
  const body = await resolved.json();
  if (!resolved.ok) throw new Error(body.message || '请求失败，请稍后重试。');
  return body.data as T;
}

export function getPosts(params: URLSearchParams, admin = false) {
  const path = admin ? '/api/admin/posts' : '/api/posts';
  const query = params.toString();
  return readData<PaginatedPosts>(admin ? apiFetch(`${path}${query ? `?${query}` : ''}`) : fetch(`${path}${query ? `?${query}` : ''}`));
}

export function getPost(slugOrID: string) {
  return readData<Post>(fetch(`/api/posts/${encodeURIComponent(slugOrID)}`));
}

export function getCategories() {
  return readData<Category[]>(fetch('/api/categories'));
}

export function getCategoryPosts(slug: string, params: URLSearchParams) {
  const query = params.toString();
  return readData<PaginatedPosts>(fetch(`/api/categories/${encodeURIComponent(slug)}/posts${query ? `?${query}` : ''}`));
}

export function getTags() {
  return readData<string[]>(fetch('/api/tags'));
}

export function getSiteSettings() {
  return readData<SiteSettings>(fetch('/api/site'));
}

export { readData };
