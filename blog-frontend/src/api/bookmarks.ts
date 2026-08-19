import { apiFetch } from '../auth';
import { readData } from './client';

export interface BookmarkItem {
  id: number;
  post_id: number;
  post_title: string;
  post_slug: string;
  created_at: string;
}

export const bookmarksApi = {
  async getBookmarks(): Promise<BookmarkItem[]> {
    const data = await readData<BookmarkItem[] | null>(apiFetch('/api/me/bookmarks'));
    return data || [];
  },

  async addBookmark(postID: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/me/bookmarks/${postID}`, {
        method: 'POST',
      })
    );
  },

  async removeBookmark(postID: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/me/bookmarks/${postID}`, {
        method: 'DELETE',
      })
    );
  },
};
