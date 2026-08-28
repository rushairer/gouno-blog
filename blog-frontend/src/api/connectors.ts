import type { ConnectorOutboxItem, ConnectorProfile } from "../types/agent";
import { apiClient } from "./client";

export const connectorApi = {
  getProfiles: () =>
    apiClient.get<ConnectorProfile[]>("/api/admin/ai-connectors"),
  getOutbox: () =>
    apiClient.get<ConnectorOutboxItem[]>("/api/admin/ai-connector-outbox"),
  saveProfile: (payload: unknown) =>
    apiClient.post<ConnectorProfile>("/api/admin/ai-connectors", payload),
  startOAuth: (id: number, provider?: "search_console") =>
    apiClient.post<{ state: string; authorization_url?: string }>(
      `/api/admin/ai-connectors/${id}/oauth/start`,
      undefined,
      { params: provider ? { provider } : undefined },
    ),
  completeOAuth: (payload: unknown) =>
    apiClient.post<void>("/api/admin/ai-connectors/oauth/callback", payload),
  queueOutbox: (payload: unknown) =>
    apiClient.post<void>("/api/admin/ai-connector-outbox", payload),
  actOnOutbox: (
    id: number,
    action: "approve" | "deliver-mock" | "retry" | "revoke",
  ) => apiClient.post<void>(`/api/admin/ai-connector-outbox/${id}/${action}`),
};
