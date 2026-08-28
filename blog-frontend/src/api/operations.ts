import type {
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
} from "../types/agent";
import { apiClient } from "./client";

export interface ArticleImagePreview {
  placement: string;
  image_url: string;
  version_matches: boolean;
  anchor_matches: boolean;
  applied?: boolean;
  cover_url?: string;
  content?: string;
}

export const operationsApi = {
  getSuggestions: (status = "all") =>
    apiClient.get<OperationalSuggestion[]>("/api/admin/ai-suggestions", {
      params: { status },
    }),
  getCandidates: () =>
    apiClient.get<ContentCandidateSet[]>("/api/admin/ai-candidates"),
  getMediaCandidates: () =>
    apiClient.get<MediaCandidate[]>("/api/admin/ai-media-candidates"),
  getEditorialTasks: () =>
    apiClient.get<EditorialTask[]>("/api/admin/ai-editorial-tasks"),
  refreshSuggestions: () =>
    apiClient.post<void>("/api/admin/ai-suggestions/refresh"),
  ignoreSuggestion: (id: number, reason: string) =>
    apiClient.post<void>(`/api/admin/ai-suggestions/${id}/ignore`, {
      reason,
    }),
  convertSuggestion: (id: number) =>
    apiClient.post<void>(`/api/admin/ai-suggestions/${id}/convert`),
  selectCandidate: (setID: number, candidateID: number) =>
    apiClient.post<void>(`/api/admin/ai-candidates/${setID}/select`, {
      candidate_id: candidateID,
    }),
  reviewMediaCandidate: (
    id: number,
    action: "reject" | "ready",
    note?: string,
  ) =>
    apiClient.post<void>(`/api/admin/ai-media-candidates/${id}/review`, {
      action,
      ...(note ? { note } : {}),
    }),
  generateMediaCandidate: (id: number) =>
    apiClient.post<void>(`/api/admin/ai-media-candidates/${id}/generate`),
  setEditorialTaskStatus: (id: number, status: "done" | "cancelled") =>
    apiClient.post<void>(`/api/admin/ai-editorial-tasks/${id}/status`, {
      status,
    }),
  imageTaskAction: (
    id: number,
    action: "select" | "apply" | "regenerate" | "reject",
    body?: unknown,
  ) => apiClient.post<void>(`/api/admin/ai-image-tasks/${id}/${action}`, body),
  batchMediaAction: (
    runID: number,
    action: "select" | "apply" | "reject",
    body: unknown,
  ) =>
    apiClient.post<void>(
      `/api/admin/ai-workflow-runs/${runID}/media-candidates/${action}`,
      body,
    ),
  cancelImageTask: (id: number) =>
    apiClient.post<void>(`/api/admin/ai-image-tasks/${id}/cancel`),
  previewImageTask: (id: number) =>
    apiClient.get<ArticleImagePreview>(
      `/api/admin/ai-image-tasks/${id}/preview`,
    ),
};
