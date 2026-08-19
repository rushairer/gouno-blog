import { postsApi, pagesApi, siteApi, readData } from '../api';
import type { Category, CustomPage, PaginatedPages, PaginatedPosts, Post, SiteSettings } from '../types/blog';

export function getPosts(params: URLSearchParams, admin = false): Promise<PaginatedPosts> {
  return postsApi.getPosts(params, admin);
}

export function getPost(slugOrID: string): Promise<Post> {
  return postsApi.getPost(slugOrID);
}

export function getCategories(): Promise<Category[]> {
  return siteApi.getCategories();
}

export function getCategoryPosts(slug: string, params: URLSearchParams): Promise<PaginatedPosts> {
  return postsApi.getCategoryPosts(slug, params);
}

export function getTags(): Promise<string[]> {
  return siteApi.getTags();
}

export function getSiteSettings(): Promise<SiteSettings> {
  return siteApi.getSiteSettings();
}

export function getPageBySlug(slug: string): Promise<CustomPage> {
  return pagesApi.getPageBySlug(slug);
}

export function getNavPages(): Promise<CustomPage[]> {
  return pagesApi.getNavPages();
}

export function getAdminPages(params?: { page?: number; pageSize?: number; q?: string; status?: string }): Promise<PaginatedPages> {
  return pagesApi.getAdminPages(params);
}

export function getAdminPage(id: number | string): Promise<CustomPage> {
  return pagesApi.getAdminPage(id);
}

export function createPage(page: Partial<CustomPage>): Promise<CustomPage> {
  return pagesApi.createPage(page);
}

export function updatePage(id: number | string, page: Partial<CustomPage>): Promise<CustomPage> {
  return pagesApi.updatePage(id, page);
}

export function deletePage(id: number | string): Promise<void> {
  return pagesApi.deletePage(id);
}

export { readData };
