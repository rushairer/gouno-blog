import type {
  MediaCandidate,
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowResource,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowStepRun,
} from "../types/agent";
import { apiClient } from "./client";

export interface ResourceOption {
  type: string;
  key: string;
  label: string;
  description?: string;
  status?: string;
  version_token: string;
  metadata: Record<string, unknown>;
}

export interface ResourcePage {
  list: ResourceOption[];
  total: number;
  unavailable_keys?: string[];
}

export const workflowApi = {
  getWorkflows: () => apiClient.get<Workflow[]>("/api/admin/ai-workflows"),
  getVersions: (id: number) =>
    apiClient.get<Workflow[]>(`/api/admin/ai-workflows/${id}/versions`),
  save: (workflow: Partial<Workflow>) =>
    workflow.id
      ? apiClient.put<Workflow>(
          `/api/admin/ai-workflows/${workflow.id}`,
          workflow,
        )
      : apiClient.post<Workflow>("/api/admin/ai-workflows", workflow),
  remove: (id: number) =>
    apiClient.delete<void>(`/api/admin/ai-workflows/${id}`),
  setEnabled: (id: number, enabled: boolean) =>
    apiClient.post<void>(
      `/api/admin/ai-workflows/${id}/${enabled ? "enable" : "disable"}`,
    ),
  rollback: (id: number, version: number) =>
    apiClient.post<void>(`/api/admin/ai-workflows/${id}/rollback`, {
      version,
    }),
  run: (id: number, input: Record<string, unknown>, dryRun = false) =>
    apiClient.post<WorkflowRun>(
      `/api/admin/ai-workflows/${id}/${dryRun ? "dry-run" : "run"}`,
      { input },
    ),
  preflight: (id: number, input: Record<string, unknown>, dryRun = false) =>
    apiClient.post<{
      ready: boolean;
      checks: Array<{ key: string; status: string; message?: string }>;
    }>(`/api/admin/ai-workflows/${id}/preflight`, {
      input,
      dry_run: dryRun,
    }),
  getMetrics: async () =>
    (
      await apiClient.get<{ workflows: WorkflowMetric[] }>(
        "/api/admin/ai-workflow-metrics",
      )
    ).workflows || [],
  getRuns: (workflowID?: number) =>
    apiClient.get<WorkflowRun[]>("/api/admin/ai-workflow-runs", {
      params: workflowID ? { workflow_id: workflowID } : undefined,
    }),
  getRunSteps: (id: number) =>
    apiClient.get<WorkflowStepRun[]>(`/api/admin/ai-workflow-runs/${id}/steps`),
  getRunResources: (id: number) =>
    apiClient.get<WorkflowResource[]>(
      `/api/admin/ai-workflow-runs/${id}/resources`,
    ),
  getRunInteractions: (id: number) =>
    apiClient.get<WorkflowInteractionTask[]>(
      `/api/admin/ai-workflow-runs/${id}/interactions`,
    ),
  getRunMediaCandidates: (id: number) =>
    apiClient.get<MediaCandidate[]>(
      `/api/admin/ai-workflow-runs/${id}/media-candidates`,
    ),
  getRunEvents: (id: number) =>
    apiClient.get<WorkflowRunEvent[]>(
      `/api/admin/ai-workflow-runs/${id}/events`,
    ),
  resolveInteraction: (task: WorkflowInteractionTask, response: unknown) =>
    apiClient.post<WorkflowInteractionTask>(
      `/api/admin/ai-interactions/${task.id}/resolve`,
      { resume_token: task.resume_token, response },
    ),
  cancelInteraction: (task: WorkflowInteractionTask) =>
    apiClient.post<void>(`/api/admin/ai-interactions/${task.id}/cancel`, {
      resume_token: task.resume_token,
    }),
  retryRun: (
    id: number,
    payload: { step_id: string; iteration?: number; iterations?: number[] },
  ) =>
    apiClient.post<WorkflowRun>(
      `/api/admin/ai-workflow-runs/${id}/retry`,
      payload,
    ),
  cancelRun: (id: number) =>
    apiClient.post<void>(`/api/admin/ai-workflow-runs/${id}/cancel`),
  deleteRun: (id: number) =>
    apiClient.delete<void>(`/api/admin/ai-workflow-runs/${id}`),
  getResources: (
    type: string,
    parameters: URLSearchParams,
    signal?: AbortSignal,
  ) =>
    apiClient.get<ResourcePage>(
      `/api/admin/ai-resources/${encodeURIComponent(type)}?${parameters}`,
      { signal },
    ),
  draftWorkflow: (prompt: string) =>
    apiClient.post<{
      workflow: Workflow;
      provider: string;
      model: string;
      planner_warning?: string;
      selected_agents?: Array<{
        id: number;
        name: string;
        skill_name?: string;
      }>;
      readiness?: { message?: string };
    }>("/api/admin/ai-workflows/draft", { prompt }),
  draftAgentSkills: (prompt: string) =>
    apiClient.post<{
      drafts: Array<{
        name: string;
        description: string;
        system_prompt: string;
        capabilities: string[];
        input_schema: Record<string, unknown>;
      }>;
      provider: string;
      model: string;
    }>("/api/admin/ai-workflows/agent-drafts", { prompt }),
};
