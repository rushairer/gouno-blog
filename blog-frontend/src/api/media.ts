import { apiClient } from "./client";

export interface MediaItem {
  id: number;
  filename: string;
  storage_name: string;
  url: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
  created_by?: string;
  created_by_principal_id?: number | null;
  updated_by_principal_id?: number | null;
  created_at: string;
  usage_count?: number;
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
    return apiClient.get<MediaItem[]>("/api/admin/media");
  },

  async uploadMedia(formData: FormData): Promise<MediaItem> {
    return apiClient.post<MediaItem>("/api/admin/media", formData);
  },

  async updateMedia(
    id: number | string,
    data: { alt_text: string },
  ): Promise<MediaItem> {
    return apiClient.put<MediaItem>(`/api/admin/media/${id}`, data);
  },

  async deleteMedia(id: number | string): Promise<void> {
    return apiClient.delete<void>(`/api/admin/media/${id}`);
  },

  async getMediaReferences(id: number | string): Promise<MediaReference[]> {
    return apiClient.get<MediaReference[]>(`/api/admin/media/${id}/references`);
  },
};
