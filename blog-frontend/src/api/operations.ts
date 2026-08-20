import type { ContentCandidateSet, EditorialTask, MediaCandidate, OperationalSuggestion } from '../types/agent';
import { authenticatedApiFetch as apiFetch, readData } from './client';

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
  getSuggestions: (status = 'all') => readData<OperationalSuggestion[]>(apiFetch(`/api/admin/ai-suggestions?status=${encodeURIComponent(status)}`)),
  getCandidates: () => readData<ContentCandidateSet[]>(apiFetch('/api/admin/ai-candidates')),
  getMediaCandidates: () => readData<MediaCandidate[]>(apiFetch('/api/admin/ai-media-candidates')),
  getEditorialTasks: () => readData<EditorialTask[]>(apiFetch('/api/admin/ai-editorial-tasks')),
  refreshSuggestions: () => readData<void>(apiFetch('/api/admin/ai-suggestions/refresh', { method: 'POST' })),
  ignoreSuggestion: (id: number, reason: string) => readData<void>(apiFetch(`/api/admin/ai-suggestions/${id}/ignore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })),
  convertSuggestion: (id: number) => readData<void>(apiFetch(`/api/admin/ai-suggestions/${id}/convert`, { method: 'POST' })),
  selectCandidate: (setID: number, candidateID: number) => readData<void>(apiFetch(`/api/admin/ai-candidates/${setID}/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate_id: candidateID }) })),
  reviewMediaCandidate: (id: number, action: 'reject' | 'ready', note?: string) => readData<void>(apiFetch(`/api/admin/ai-media-candidates/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(note ? { note } : {}) }) })),
  generateMediaCandidate: (id: number) => readData<void>(apiFetch(`/api/admin/ai-media-candidates/${id}/generate`, { method: 'POST' })),
  setEditorialTaskStatus: (id: number, status: 'done' | 'cancelled') => readData<void>(apiFetch(`/api/admin/ai-editorial-tasks/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })),
  imageTaskAction: (id: number, action: 'select' | 'apply' | 'regenerate' | 'reject', body?: unknown) => readData<void>(apiFetch(`/api/admin/ai-image-tasks/${id}/${action}`, {
    method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })),
  batchMediaAction: (runID: number, action: 'select' | 'apply' | 'reject', body: unknown) => readData<void>(apiFetch(`/api/admin/ai-workflow-runs/${runID}/media-candidates/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })),
  cancelImageTask: (id: number) => readData<void>(apiFetch(`/api/admin/ai-image-tasks/${id}/cancel`, { method: 'POST' })),
  previewImageTask: (id: number) => readData<ArticleImagePreview>(apiFetch(`/api/admin/ai-image-tasks/${id}/preview`)),
};
