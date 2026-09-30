import type {
  ExternalAPIClient,
  ExternalAPIClientPayload,
  ExternalAPICreatedClient,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../types/external-capability";
import { apiClient } from "./client";

export const externalCapabilityApi = {
  getCapabilities: () =>
    apiClient.get<ExternalCapability[]>("/api/admin/external-api/capabilities"),

  getClients: () =>
    apiClient.get<ExternalAPIClient[]>("/api/admin/external-api/clients"),

  getAudits: (options: { clientId?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (options.clientId) query.set("client_id", String(options.clientId));
    if (options.limit) query.set("limit", String(options.limit));
    const suffix = query.toString();
    return apiClient.get<ExternalInvocationAudit[]>(
      `/api/admin/external-api/audits${suffix ? `?${suffix}` : ""}`,
    );
  },

  createClient: (payload: ExternalAPIClientPayload) =>
    apiClient.post<ExternalAPICreatedClient>(
      "/api/admin/external-api/clients",
      payload,
    ),

  updateClient: (id: number, payload: ExternalAPIClientPayload) =>
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
