import { authenticatedApiFetch as apiFetch, readData } from './client';
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
} from '../types/agent';

export const agentApi = {
  async getToolCatalog(): Promise<ToolDefinition[]> {
    return readData<ToolDefinition[]>(apiFetch('/api/admin/agent-tools'));
  },

  async getInteractions(): Promise<WorkflowInteractionTask[]> {
    const res = await apiFetch('/api/admin/ai-interactions');
    if (!res.ok) return [];
    return readData<WorkflowInteractionTask[]>(res);
  },

  async resolveInteraction(taskId: string, resumeToken: string, response: Record<string, unknown>): Promise<WorkflowInteractionTask> {
    return readData<WorkflowInteractionTask>(
      apiFetch(`/api/admin/ai-interactions/${taskId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_token: resumeToken, response }),
      })
    );
  },

  async getProviderProfiles(): Promise<ProviderProfile[]> {
    return readData<ProviderProfile[]>(apiFetch('/api/admin/provider-profiles'));
  },

  async saveProviderProfile(profile: Partial<ProviderProfile>): Promise<ProviderProfile> {
    return readData<ProviderProfile>(
      apiFetch(profile.id ? `/api/admin/provider-profiles/${profile.id}` : '/api/admin/provider-profiles', {
        method: profile.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    );
  },

  async saveProviderProfileWithSetup(profile: Partial<ProviderProfile>): Promise<{ profile: ProviderProfile; starter_agents_created: number }> {
    return readData<{ profile: ProviderProfile; starter_agents_created: number }>(
      apiFetch(profile.id ? `/api/admin/provider-profiles/${profile.id}` : '/api/admin/provider-profiles', {
        method: profile.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
      })
    );
  },

  async getEmbeddingProfiles(): Promise<EmbeddingProfile[]> {
    return readData<EmbeddingProfile[]>(apiFetch('/api/admin/embedding-profiles'));
  },

  async saveEmbeddingProfile(profile: Partial<EmbeddingProfile>): Promise<EmbeddingProfile> {
    return readData<EmbeddingProfile>(
      apiFetch(profile.id ? `/api/admin/embedding-profiles/${profile.id}` : '/api/admin/embedding-profiles', {
        method: profile.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    );
  },

  async getIndexStatus(): Promise<{ queued: number; failed: number; chunks: number }> {
    return readData<{ queued: number; failed: number; chunks: number }>(apiFetch('/api/admin/ai-index/status'));
  },

  async getAgents(): Promise<Agent[]> {
    return readData<Agent[]>(apiFetch('/api/admin/agents'));
  },

  async saveAgent(agent: Partial<Agent>): Promise<Agent> {
    return readData<Agent>(
      apiFetch(agent.id ? `/api/admin/agents/${agent.id}` : '/api/admin/agents', {
        method: agent.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      })
    );
  },

  async getAgentRuns(pageSize = 100): Promise<AgentRun[]> {
    const data = await readData<{ list: AgentRun[] }>(apiFetch(`/api/admin/agent-runs?pageSize=${pageSize}`));
    return data.list || [];
  },

  async getAgentRunDetail(runId: string): Promise<{ run: AgentRun; tool_calls: AgentToolCall[] }> {
    return readData<{ run: AgentRun; tool_calls: AgentToolCall[] }>(apiFetch(`/api/admin/agent-runs/${runId}`));
  },

  async getAgentApprovals(status = 'pending', pageSize = 100): Promise<AgentApproval[]> {
    const data = await readData<{ list: AgentApproval[] }>(
      apiFetch(`/api/admin/agent-approvals?status=${encodeURIComponent(status)}&pageSize=${pageSize}`)
    );
    return data.list || [];
  },

  async getAgentSkills(): Promise<AgentSkill[]> {
    return readData<AgentSkill[]>(apiFetch('/api/admin/agent-skills'));
  },

  async saveAgentSkill(skill: Partial<AgentSkill>): Promise<AgentSkill> {
    return readData<AgentSkill>(
      apiFetch(skill.id ? `/api/admin/agent-skills/${skill.id}` : '/api/admin/agent-skills', {
        method: skill.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      })
    );
  },

  async getDraftAssist(payload: { task: string; title: string; summary: string; content: string; prompt?: string }): Promise<string[]> {
    const data = await readData<{ suggestions: string[] }>(
      apiFetch('/api/admin/ai-draft-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    return data.suggestions || [];
  },

  copySkill: (id: number, name: string) => readData<void>(apiFetch(`/api/admin/agent-skills/${id}/copy`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })),
  runAgent: (id: number) => readData<void>(apiFetch(`/api/admin/agents/${id}/run`, { method: 'POST' })),
  setAgentEnabled: (id: number, enabled: boolean) => readData<void>(apiFetch(`/api/admin/agents/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' })),
  reviewApproval: (id: number, approved: boolean) => readData<void>(apiFetch(`/api/admin/agent-approvals/${id}/${approved ? 'approve' : 'reject'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '' }),
  })),
  deleteAgentRun: (id: string) => readData<void>(apiFetch(`/api/admin/agent-runs/${id}`, { method: 'DELETE' })),
  deleteAgent: (id: number) => readData<void>(apiFetch(`/api/admin/agents/${id}`, { method: 'DELETE' })),
  deleteProviderProfile: (id: number) => readData<void>(apiFetch(`/api/admin/provider-profiles/${id}`, { method: 'DELETE' })),
  deleteEmbeddingProfile: (id: number) => readData<void>(apiFetch(`/api/admin/embedding-profiles/${id}`, { method: 'DELETE' })),
  deleteAgentSkill: (id: number) => readData<void>(apiFetch(`/api/admin/agent-skills/${id}`, { method: 'DELETE' })),
  setDefaultProvider: (id: number, purpose: 'writing' | 'image') => readData<void>(apiFetch(`/api/admin/provider-profiles/${id}/default/${purpose}`, { method: 'POST' })),
  testProvider: (id: number) => readData<void>(apiFetch(`/api/admin/provider-profiles/${id}/test`, { method: 'POST' })),
  testEmbedding: (id: number) => readData<void>(apiFetch(`/api/admin/embedding-profiles/${id}/test`, { method: 'POST' })),
  retryIndex: () => readData<void>(apiFetch('/api/admin/ai-index/retry', { method: 'POST' })),
  rebuildIndex: () => readData<void>(apiFetch('/api/admin/ai-index/rebuild', { method: 'POST' })),
  exportProviders: async () => {
    const response = await apiFetch('/api/admin/provider-profiles/export');
    if (!response.ok) await readData<void>(response);
    return response.blob();
  },
  importProviders: (payload: unknown) => readData<{ imported_count: number }>(apiFetch('/api/admin/provider-profiles/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })),
  importSkill: (payload: unknown) => readData<AgentSkill>(apiFetch('/api/admin/agent-skills/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })),
  exportSkill: async (id: number) => {
    const response = await apiFetch(`/api/admin/agent-skills/${id}/export`);
    if (!response.ok) await readData<void>(response);
    return response.blob();
  },
};
