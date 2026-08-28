import type {
  Agent,
  AgentApproval,
  AgentRun,
  AgentSkill,
  AgentToolCall,
  EmbeddingProfile,
  ProviderProfile,
  ToolDefinition,
  WorkflowInteractionTask,
} from "../types/agent";
import { apiClient } from "./client";

export interface DraftMetadataResult {
  summary?: string;
  tags?: string[];
  slug?: string;
  seo_title?: string;
  seo_description?: string;
  category?: string;
  cover_alt?: string;
}

export interface DraftAssistPayload {
  task:
    | "title"
    | "summary"
    | "slug"
    | "content"
    | "tags"
    | "seo"
    | "alt"
    | "category"
    | "cover_prompt"
    | "metadata_all"
    | string;
  title?: string;
  summary?: string;
  content?: string;
  prompt?: string;
  categories?: string[];
}

export interface DraftAssistResponse {
  suggestions: string[];
  metadata?: DraftMetadataResult;
  provider?: string;
  model?: string;
}

export const agentApi = {
  async getDraftAssist(
    payload: DraftAssistPayload,
  ): Promise<DraftAssistResponse> {
    const data = await apiClient.post<{
      suggestions: string[];
      metadata?: DraftMetadataResult;
      provider?: string;
      model?: string;
    }>("/api/admin/ai-draft-assist", payload);
    return {
      suggestions: data.suggestions || [],
      metadata: data.metadata,
      provider: data.provider,
      model: data.model,
    };
  },
  async generateImage(payload: {
    prompt: string;
    alt_text?: string;
  }): Promise<{ url: string; asset_id?: number; alt_text?: string }> {
    return apiClient.post<{
      url: string;
      asset_id?: number;
      alt_text?: string;
    }>("/api/admin/ai-generate-image", payload);
  },
  async generateCoverImage(payload: {
    prompt: string;
    alt_text?: string;
  }): Promise<{ url: string; asset_id?: number; alt_text?: string }> {
    return this.generateImage(payload);
  },
  async getToolCatalog(): Promise<ToolDefinition[]> {
    return apiClient.get<ToolDefinition[]>("/api/admin/agent-tools");
  },

  async getInteractions(): Promise<WorkflowInteractionTask[]> {
    try {
      return await apiClient.get<WorkflowInteractionTask[]>(
        "/api/admin/ai-interactions",
      );
    } catch {
      return [];
    }
  },

  async resolveInteraction(
    taskId: string,
    resumeToken: string,
    response: Record<string, unknown>,
  ): Promise<WorkflowInteractionTask> {
    return apiClient.post<WorkflowInteractionTask>(
      `/api/admin/ai-interactions/${taskId}/resolve`,
      { resume_token: resumeToken, response },
    );
  },

  async getProviderProfiles(): Promise<ProviderProfile[]> {
    return apiClient.get<ProviderProfile[]>("/api/admin/provider-profiles");
  },

  async saveProviderProfile(
    profile: Partial<ProviderProfile>,
  ): Promise<ProviderProfile> {
    return profile.id
      ? apiClient.put<ProviderProfile>(
          `/api/admin/provider-profiles/${profile.id}`,
          profile,
        )
      : apiClient.post<ProviderProfile>(
          "/api/admin/provider-profiles",
          profile,
        );
  },

  async saveProviderProfileWithSetup(
    profile: Partial<ProviderProfile>,
  ): Promise<{ profile: ProviderProfile; starter_agents_created: number }> {
    return profile.id
      ? apiClient.put<{
          profile: ProviderProfile;
          starter_agents_created: number;
        }>(`/api/admin/provider-profiles/${profile.id}`, profile)
      : apiClient.post<{
          profile: ProviderProfile;
          starter_agents_created: number;
        }>("/api/admin/provider-profiles", profile);
  },

  async getEmbeddingProfiles(): Promise<EmbeddingProfile[]> {
    return apiClient.get<EmbeddingProfile[]>("/api/admin/embedding-profiles");
  },

  async saveEmbeddingProfile(
    profile: Partial<EmbeddingProfile>,
  ): Promise<EmbeddingProfile> {
    return profile.id
      ? apiClient.put<EmbeddingProfile>(
          `/api/admin/embedding-profiles/${profile.id}`,
          profile,
        )
      : apiClient.post<EmbeddingProfile>(
          "/api/admin/embedding-profiles",
          profile,
        );
  },

  async getIndexStatus(): Promise<{
    queued: number;
    failed: number;
    chunks: number;
  }> {
    return apiClient.get<{
      queued: number;
      failed: number;
      chunks: number;
    }>("/api/admin/ai-index/status");
  },

  async getAgents(): Promise<Agent[]> {
    return apiClient.get<Agent[]>("/api/admin/agents");
  },

  async saveAgent(agent: Partial<Agent>): Promise<Agent> {
    return agent.id
      ? apiClient.put<Agent>(`/api/admin/agents/${agent.id}`, agent)
      : apiClient.post<Agent>("/api/admin/agents", agent);
  },

  async getAgentRuns(pageSize = 100): Promise<AgentRun[]> {
    const data = await apiClient.get<{ list: AgentRun[] }>(
      "/api/admin/agent-runs",
      { params: { pageSize } },
    );
    return data.list || [];
  },

  async getAgentRunDetail(
    runId: string,
  ): Promise<{ run: AgentRun; tool_calls: AgentToolCall[] }> {
    return apiClient.get<{ run: AgentRun; tool_calls: AgentToolCall[] }>(
      `/api/admin/agent-runs/${runId}`,
    );
  },

  async getAgentApprovals(
    status = "pending",
    pageSize = 100,
  ): Promise<AgentApproval[]> {
    const data = await apiClient.get<{ list: AgentApproval[] }>(
      "/api/admin/agent-approvals",
      { params: { status, pageSize } },
    );
    return data.list || [];
  },

  async getAgentSkills(): Promise<AgentSkill[]> {
    return apiClient.get<AgentSkill[]>("/api/admin/agent-skills");
  },

  async saveAgentSkill(skill: Partial<AgentSkill>): Promise<AgentSkill> {
    return skill.id
      ? apiClient.put<AgentSkill>(`/api/admin/agent-skills/${skill.id}`, skill)
      : apiClient.post<AgentSkill>("/api/admin/agent-skills", skill);
  },

  copySkill: (id: number, name: string) =>
    apiClient.post<void>(`/api/admin/agent-skills/${id}/copy`, { name }),
  runAgent: (id: number) => apiClient.post<void>(`/api/admin/agents/${id}/run`),
  setAgentEnabled: (id: number, enabled: boolean) =>
    apiClient.post<void>(
      `/api/admin/agents/${id}/${enabled ? "enable" : "disable"}`,
    ),
  reviewApproval: (id: number, approved: boolean) =>
    apiClient.post<void>(
      `/api/admin/agent-approvals/${id}/${approved ? "approve" : "reject"}`,
      { note: "" },
    ),
  deleteAgentRun: (id: string) =>
    apiClient.delete<void>(`/api/admin/agent-runs/${id}`),
  deleteAgent: (id: number) =>
    apiClient.delete<void>(`/api/admin/agents/${id}`),
  deleteProviderProfile: (id: number) =>
    apiClient.delete<void>(`/api/admin/provider-profiles/${id}`),
  deleteEmbeddingProfile: (id: number) =>
    apiClient.delete<void>(`/api/admin/embedding-profiles/${id}`),
  deleteAgentSkill: (id: number) =>
    apiClient.delete<void>(`/api/admin/agent-skills/${id}`),
  setDefaultProvider: (id: number, purpose: "writing" | "image") =>
    apiClient.post<void>(
      `/api/admin/provider-profiles/${id}/default/${purpose}`,
    ),
  testProvider: (id: number) =>
    apiClient.post<void>(`/api/admin/provider-profiles/${id}/test`),
  testEmbedding: (id: number) =>
    apiClient.post<void>(`/api/admin/embedding-profiles/${id}/test`),
  retryIndex: () => apiClient.post<void>("/api/admin/ai-index/retry"),
  rebuildIndex: () => apiClient.post<void>("/api/admin/ai-index/rebuild"),
  exportProviders: () =>
    apiClient.getBlob("/api/admin/provider-profiles/export"),
  importProviders: (payload: unknown) =>
    apiClient.post<{ imported_count: number }>(
      "/api/admin/provider-profiles/import",
      payload,
    ),
  importSkill: (payload: unknown) =>
    apiClient.post<AgentSkill>("/api/admin/agent-skills/import", payload),
  exportSkill: (id: number) =>
    apiClient.getBlob(`/api/admin/agent-skills/${id}/export`),
};
