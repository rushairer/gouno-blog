import { apiFetch } from '../auth';
import { readData } from './client';

export interface MediaItem {
  id: number;
  filename: string;
  storage_name: string;
  url: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
  created_at: string;
  references_count?: number;
}

export interface MediaReference {
  post_id: number;
  post_title: string;
  post_slug: string;
  post_status: string;
}

export const mediaApi = {
  async listMedia(): Promise<MediaItem[]> {
    return readData<MediaItem[]>(apiFetch('/api/admin/media'));
  },

  async uploadMedia(formData: FormData): Promise<MediaItem> {
    return readData<MediaItem>(
      apiFetch('/api/admin/media', {
        method: 'POST',
        body: formData,
      })
    );
  },

  async deleteMedia(id: number | string): Promise<void> {
    return readData<void>(
      apiFetch(`/api/admin/media/${id}`, {
        method: 'DELETE',
      })
    );
  },

  async getMediaReferences(id: number | string): Promise<MediaReference[]> {
    return readData<MediaReference[]>(apiFetch(`/api/admin/media/${id}/references`));
  },
};
