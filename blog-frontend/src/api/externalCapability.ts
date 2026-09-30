import type {
  ExternalAPIClient,
  ExternalAPIClientCreateInput,
  ExternalAPIClientUpdateInput,
  ExternalAPICreatedClient,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../types/externalCapability";
import { apiClient } from "./client";

export const externalCapabilityApi = {
  listCapabilities: () =>
    apiClient.get<ExternalCapability[]>("/api/admin/external-api/capabilities"),
  listClients: () =>
    apiClient.get<ExternalAPIClient[]>("/api/admin/external-api/clients"),
  listAudits: (options?: { clientId?: number; limit?: number }) =>
    apiClient.get<ExternalInvocationAudit[]>("/api/admin/external-api/audits", {
      params: {
        client_id: options?.clientId,
        limit: options?.limit ?? 100,
      },
    }),
  createClient: (payload: ExternalAPIClientCreateInput) =>
    apiClient.post<ExternalAPICreatedClient>(
      "/api/admin/external-api/clients",
      payload,
    ),
  updateClient: (id: number, payload: ExternalAPIClientUpdateInput) =>
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
