import { apiFetch } from '../auth';
import { readData } from './client';
import type {
  Agent,
  AgentApproval,
  AgentRun,
  AgentSkill,
  AgentToolCall,
  ContentCandidateSet,
  EditorialTask,
  EmbeddingProfile,
  MediaCandidate,
  OperationalSuggestion,
  ProviderProfile,
  ToolDefinition,
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowRun,
} from '../agent';

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

  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    return readData<WorkflowRun[]>(apiFetch('/api/admin/ai-workflow-runs'));
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

  async getWorkflows(): Promise<Workflow[]> {
    return readData<Workflow[]>(apiFetch('/api/admin/ai-workflows'));
  },

  async saveWorkflow(workflow: Partial<Workflow>): Promise<Workflow> {
    return readData<Workflow>(
      apiFetch(workflow.id ? `/api/admin/ai-workflows/${workflow.id}` : '/api/admin/ai-workflows', {
        method: workflow.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      })
    );
  },

  async runWorkflow(workflowId: string, dryRun = false): Promise<WorkflowRun> {
    return readData<WorkflowRun>(
      apiFetch(`/api/admin/ai-workflows/${workflowId}/${dryRun ? 'dry-run' : 'run'}`, {
        method: 'POST',
      })
    );
  },

  async preflightWorkflow(
    workflowId: string,
    inputs: Record<string, unknown>
  ): Promise<{ ready: boolean; checks: Array<{ key: string; status: string; message?: string }> }> {
    return readData<{ ready: boolean; checks: Array<{ key: string; status: string; message?: string }> }>(
      apiFetch(`/api/admin/ai-workflows/${workflowId}/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      })
    );
  },

  async getWorkflowMetrics(): Promise<WorkflowMetric[]> {
    const data = await readData<{ workflows: WorkflowMetric[] }>(apiFetch('/api/admin/ai-workflow-metrics'));
    return data.workflows || [];
  },

  async getSuggestions(status = 'all'): Promise<OperationalSuggestion[]> {
    return readData<OperationalSuggestion[]>(apiFetch(`/api/admin/ai-suggestions?status=${encodeURIComponent(status)}`));
  },

  async getCandidates(): Promise<ContentCandidateSet[]> {
    return readData<ContentCandidateSet[]>(apiFetch('/api/admin/ai-candidates'));
  },

  async getMediaCandidates(): Promise<MediaCandidate[]> {
    return readData<MediaCandidate[]>(apiFetch('/api/admin/ai-media-candidates'));
  },

  async getEditorialTasks(): Promise<EditorialTask[]> {
    return readData<EditorialTask[]>(apiFetch('/api/admin/ai-editorial-tasks'));
  },

  async getDraftAssist(payload: { task: string; title: string; summary: string; content: string }): Promise<string[]> {
    const data = await readData<{ suggestions: string[] }>(
      apiFetch('/api/admin/ai-draft-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    return data.suggestions || [];
  },
};
