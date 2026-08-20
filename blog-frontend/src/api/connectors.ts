import type { ConnectorOutboxItem, ConnectorProfile } from '../types/agent';
import { authenticatedApiFetch as apiFetch, readData } from './client';

export const connectorApi = {
  getProfiles: () => readData<ConnectorProfile[]>(apiFetch('/api/admin/ai-connectors')),
  getOutbox: () => readData<ConnectorOutboxItem[]>(apiFetch('/api/admin/ai-connector-outbox')),
  saveProfile: (payload: unknown) => readData<ConnectorProfile>(apiFetch('/api/admin/ai-connectors', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })),
  startOAuth: (id: number, provider?: 'search_console') => readData<{ state: string; authorization_url?: string }>(apiFetch(`/api/admin/ai-connectors/${id}/oauth/start${provider ? `?provider=${provider}` : ''}`, { method: 'POST' })),
  completeOAuth: (payload: unknown) => readData<void>(apiFetch('/api/admin/ai-connectors/oauth/callback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })),
  queueOutbox: (payload: unknown) => readData<void>(apiFetch('/api/admin/ai-connector-outbox', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })),
  actOnOutbox: (id: number, action: 'approve' | 'deliver-mock' | 'retry' | 'revoke') => readData<void>(apiFetch(`/api/admin/ai-connector-outbox/${id}/${action}`, { method: 'POST' })),
};
