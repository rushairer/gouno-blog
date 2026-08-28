import { apiClient } from "./client";

export type BlogPrincipal = {
  id: number;
  issuer: string;
  subject: string;
  display_name: string;
  email: string;
};

export type BlogMember = {
  principal: BlogPrincipal;
  membership_status: "" | "active" | "suspended" | "removed";
  roles: string[];
  permissions: string[];
};

export const membersApi = {
  list: () => apiClient.get<{ members: BlogMember[] }>("/api/admin/members"),
  update: (
    principalID: number,
    status: string,
    roles: string[],
    displayName?: string,
    reason = "",
  ) =>
    apiClient.put<{ updated: boolean }>(`/api/admin/members/${principalID}`, {
      display_name: displayName,
      status,
      roles,
      reason,
    }),
  transferOwner: (principalID: number, reason = "") =>
    apiClient.post<{ transferred: boolean }>(
      `/api/admin/members/${principalID}/transfer-owner`,
      { reason },
    ),
};
