import { authenticatedApiFetch as apiFetch, optionalApiFetch, readData } from './client';

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
        method: 'PUT',
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

  async setBookmark(postID: number | string, bookmarked: boolean): Promise<void> {
    return readData<void>(
      optionalApiFetch(`/api/me/bookmarks/${postID}`, {
        method: bookmarked ? 'PUT' : 'DELETE',
      })
    );
  },
};
