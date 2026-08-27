import { authenticatedApiFetch, readData } from "./client";

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
  list: () => readData<{ members: BlogMember[] }>(authenticatedApiFetch("/api/admin/members")),
  update: (principalID: number, status: string, roles: string[], reason = "") =>
    readData<{ updated: boolean }>(authenticatedApiFetch(`/api/admin/members/${principalID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, roles, reason }),
    })),
  transferOwner: (principalID: number, reason = "") =>
    readData<{ transferred: boolean }>(authenticatedApiFetch(`/api/admin/members/${principalID}/transfer-owner`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    })),
};
