import type {
  ExternalAPICreatedClient,
  ExternalAPIClient,
  ExternalAPIClientCreateInput,
  ExternalAPIClientUpdateInput,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../types/externalCapability";
import { apiClient } from "./client";

export const externalCapabilityApi = {
  getCapabilities: () =>
    apiClient.get<ExternalCapability[]>("/api/admin/external-api/capabilities"),

  getClients: () =>
    apiClient.get<ExternalAPIClient[]>("/api/admin/external-api/clients"),

  getAudits: (params?: { client_id?: number; limit?: number }) =>
    apiClient.get<ExternalInvocationAudit[]>("/api/admin/external-api/audits", {
      params,
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
    apiClient.delete<void>(`/api/admin/external-api/clients/${id}`),
};
