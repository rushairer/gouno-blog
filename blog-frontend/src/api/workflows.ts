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
import { authenticatedApiFetch as apiFetch, readData } from "./client";

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
  getWorkflows: () => readData<Workflow[]>(apiFetch("/api/admin/ai-workflows")),
  getVersions: (id: number) =>
    readData<Workflow[]>(apiFetch(`/api/admin/ai-workflows/${id}/versions`)),
  save: (workflow: Partial<Workflow>) =>
    readData<Workflow>(
      apiFetch(
        workflow.id
          ? `/api/admin/ai-workflows/${workflow.id}`
          : "/api/admin/ai-workflows",
        {
          method: workflow.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workflow),
        },
      ),
    ),
  remove: (id: number) =>
    readData<void>(
      apiFetch(`/api/admin/ai-workflows/${id}`, { method: "DELETE" }),
    ),
  setEnabled: (id: number, enabled: boolean) =>
    readData<void>(
      apiFetch(
        `/api/admin/ai-workflows/${id}/${enabled ? "enable" : "disable"}`,
        { method: "POST" },
      ),
    ),
  rollback: (id: number, version: number) =>
    readData<void>(
      apiFetch(`/api/admin/ai-workflows/${id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      }),
    ),
  run: (id: number, input: Record<string, unknown>, dryRun = false) =>
    readData<WorkflowRun>(
      apiFetch(`/api/admin/ai-workflows/${id}/${dryRun ? "dry-run" : "run"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      }),
    ),
  preflight: (id: number, input: Record<string, unknown>, dryRun = false) =>
    readData<{
      ready: boolean;
      checks: Array<{ key: string; status: string; message?: string }>;
    }>(
      apiFetch(`/api/admin/ai-workflows/${id}/preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, dry_run: dryRun }),
      }),
    ),
  getMetrics: async () =>
    (
      await readData<{ workflows: WorkflowMetric[] }>(
        apiFetch("/api/admin/ai-workflow-metrics"),
      )
    ).workflows || [],
  getRuns: (workflowID?: number) =>
    readData<WorkflowRun[]>(
      apiFetch(
        `/api/admin/ai-workflow-runs${workflowID ? `?workflow_id=${workflowID}` : ""}`,
      ),
    ),
  getRunSteps: (id: number) =>
    readData<WorkflowStepRun[]>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/steps`),
    ),
  getRunResources: (id: number) =>
    readData<WorkflowResource[]>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/resources`),
    ),
  getRunInteractions: (id: number) =>
    readData<WorkflowInteractionTask[]>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/interactions`),
    ),
  getRunMediaCandidates: (id: number) =>
    readData<MediaCandidate[]>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/media-candidates`),
    ),
  getRunEvents: (id: number) =>
    readData<WorkflowRunEvent[]>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/events`),
    ),
  resolveInteraction: (task: WorkflowInteractionTask, response: unknown) =>
    readData<WorkflowInteractionTask>(
      apiFetch(`/api/admin/ai-interactions/${task.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_token: task.resume_token, response }),
      }),
    ),
  cancelInteraction: (task: WorkflowInteractionTask) =>
    readData<void>(
      apiFetch(`/api/admin/ai-interactions/${task.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_token: task.resume_token }),
      }),
    ),
  retryRun: (
    id: number,
    payload: { step_id: string; iteration?: number; iterations?: number[] },
  ) =>
    readData<WorkflowRun>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  cancelRun: (id: number) =>
    readData<void>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}/cancel`, { method: "POST" }),
    ),
  deleteRun: (id: number) =>
    readData<void>(
      apiFetch(`/api/admin/ai-workflow-runs/${id}`, { method: "DELETE" }),
    ),
  getResources: (
    type: string,
    parameters: URLSearchParams,
    signal?: AbortSignal,
  ) =>
    readData<ResourcePage>(
      apiFetch(
        `/api/admin/ai-resources/${encodeURIComponent(type)}?${parameters}`,
        { signal },
      ),
    ),
  draftWorkflow: (prompt: string) =>
    readData<{
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
    }>(
      apiFetch("/api/admin/ai-workflows/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }),
    ),
  draftAgentSkills: (prompt: string) =>
    readData<{
      drafts: Array<{
        name: string;
        description: string;
        system_prompt: string;
        capabilities: string[];
        input_schema: Record<string, unknown>;
      }>;
      provider: string;
      model: string;
    }>(
      apiFetch("/api/admin/ai-workflows/agent-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }),
    ),
};
