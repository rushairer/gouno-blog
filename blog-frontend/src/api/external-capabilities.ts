import { apiClient } from "./client";
import type {
  ExternalAPICreatedClient,
  ExternalAPIClient,
  ExternalAPIClientInput,
  ExternalAPIInvocationAudit,
  ExternalCapability,
} from "../types/external-api";

export const externalCapabilityApi = {
  getCapabilities: () =>
    apiClient.get<ExternalCapability[]>("/api/admin/external-api/capabilities"),

  getClients: () =>
    apiClient.get<ExternalAPIClient[]>("/api/admin/external-api/clients"),

  getAudits: (clientId?: number, limit = 100) =>
    apiClient.get<ExternalAPIInvocationAudit[]>(
      "/api/admin/external-api/audits",
      {
        params: clientId ? { client_id: clientId, limit } : { limit },
      },
    ),

  createClient: (payload: ExternalAPIClientInput) =>
    apiClient.post<ExternalAPICreatedClient>(
      "/api/admin/external-api/clients",
      payload,
    ),

  updateClient: (id: number, payload: ExternalAPIClientInput) =>
    apiClient.put<ExternalAPIClient>(
      `/api/admin/external-api/clients/${id}`,
      payload,
    ),

  rotateClientKey: (id: number) =>
    apiClient.post<ExternalAPICreatedClient>(
      `/api/admin/external-api/clients/${id}/rotate`,
    ),

  revokeClient: (id: number) =>
    apiClient.delete<{ revoked: boolean }>(
      `/api/admin/external-api/clients/${id}`,
    ),
};
