export type ProviderType = 'openai' | 'anthropic' | 'gemini';
export type TriggerType = 'manual' | 'cron';
export type ExecutionMode = 'advisory' | 'approval';
export type RunStatus = 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';

export interface ProviderProfile {
  id: number;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  model: string;
  api_key_last4?: string;
  has_api_key: boolean;
  enabled: boolean;
  request_timeout_seconds: number;
  max_output_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface EmbeddingProfile {
  id: number;
  name: string;
  base_url: string;
  model: string;
  dimensions: number;
  api_key_last4?: string;
  has_api_key: boolean;
  enabled: boolean;
  request_timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface AgentCitation {
  citation_id: string;
  post_id?: number;
  title?: string;
  slug?: string;
  chunk_id?: number;
  start_offset?: number;
  end_offset?: number;
  snippet?: string;
  lexical_score?: number;
  semantic_score?: number;
  score?: number;
  status: 'validated' | 'unsupported';
}

export interface WorkflowStep {
  id: string;
  type: 'tool' | 'model' | 'for_each' | 'approval_gate' | 'output';
  name?: string;
  tool_name?: string;
  agent_id?: number;
  agent_id_pointer?: string;
  arguments?: Record<string, unknown>;
  arguments_pointer?: string;
  input_pointer?: string;
  collection_pointer?: string;
  max_items?: number;
  steps?: WorkflowStep[];
  output_pointer?: string;
}

export interface Workflow {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  template_key?: string;
  current_version: number;
  version_id: number;
  input_schema: Record<string, unknown>;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  workflow_version_id: number;
  dry_run: boolean;
  status: string;
  input: Record<string, unknown>;
  output?: unknown;
  error_message?: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface WorkflowMetric {
  workflow_id: number;
  name: string;
  runs: number;
  failures: number;
  tokens: number;
}

export interface OperationalSuggestion {
  id: number;
  source_type: string;
  source_key: string;
  source_run_id?: number;
  workflow_run_id?: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  evidence: Record<string, unknown>;
  window_start?: string;
  window_end?: string;
  status: 'new' | 'ignored' | 'converted' | 'selected';
  ignored_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentCandidate {
  id: number;
  value: string;
  rationale: string;
  created_at: string;
}

export interface ContentCandidateSet {
  id: number;
  post_id: number;
  source_run_id: number;
  source_approval_id: number;
  field_type: 'title' | 'summary' | 'cover_alt';
  before_value: string;
  status: 'pending' | 'selected' | 'expired';
  selected_candidate_id?: number;
  candidates: ContentCandidate[];
  created_at: string;
  updated_at: string;
}

export interface MediaCandidate {
  id: number;
  post_id: number;
  headline: string;
  brief: string;
  platform?: string;
  alt_text: string;
  generation_status: 'brief_ready' | 'ready_to_generate' | 'generating' | 'generated' | 'rejected' | 'failed';
  safety_status: string;
  copyright_status: string;
  media_asset_id?: number;
  reviewed_at?: string;
  created_at: string;
}

export interface OutcomeMetrics {
  feedback: { target_type: string; label: string; count: number }[];
  suggestions: number;
  converted: number;
  ignored: number;
  candidate_sets: number;
  selected_candidate_sets: number;
  rule_metrics?: { key: string; label: string; count: number; tokens: number }[];
  skill_metrics?: { key: string; label: string; count: number; tokens: number }[];
  workflow_metrics?: { key: string; label: string; count: number; tokens: number }[];
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  system_prompt: string;
  provider_profile_id: number;
  skill_version_id?: number;
  enabled: boolean;
  trigger_type: TriggerType;
  cron_expression?: string;
  timezone: string;
  capabilities: string[];
  execution_mode: ExecutionMode;
  max_steps: number;
  max_input_tokens: number;
  max_output_tokens: number;
  daily_run_limit: number;
  monthly_token_budget: number;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSkill {
  id: number;
  name: string;
  description: string;
  system_prompt: string;
  capabilities: string[];
  execution_mode: ExecutionMode;
  max_steps: number;
  max_input_tokens: number;
  max_output_tokens: number;
  daily_run_limit: number;
  monthly_token_budget: number;
  version: number;
  version_id: number;
  input_schema: Record<string, unknown>;
  allowed_triggers: TriggerType[];
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: number;
  agent_id: number;
  trigger_type: TriggerType;
  status: RunStatus;
  output_summary: string;
  provider: ProviderType;
  model: string;
  input_tokens: number;
  output_tokens: number;
  error_code?: string;
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  citations?: AgentCitation[];
}

export interface AgentToolCall {
  id: number;
  run_id: number;
  tool_name: string;
  risk_level: 'read' | 'propose' | 'write';
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'requested' | 'executed' | 'rejected' | 'failed';
  error_message?: string;
  created_at: string;
}

export interface AgentApproval {
  id: number;
  run_id: number;
  tool_call_id: number;
  action_type: string;
  target_type: string;
  target_id?: number;
  proposed_payload: Record<string, unknown>;
  before_snapshot?: Record<string, unknown>;
  status: ApprovalStatus;
  review_note?: string;
  expires_at: string;
  created_at: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk_level: 'read' | 'propose' | 'write';
}

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  trigger_type: TriggerType;
  cron_expression: string;
  timezone: string;
  capabilities: string[];
  execution_mode: ExecutionMode;
}

export const emptyProvider: Omit<ProviderProfile, 'id' | 'created_at' | 'updated_at' | 'has_api_key' | 'api_key_last4'> & { api_key: string } = {
  name: '',
  provider_type: 'openai',
  base_url: 'https://api.openai.com',
  model: '',
  api_key: '',
  enabled: true,
  request_timeout_seconds: 60,
  max_output_tokens: 2000,
};

export function emptyAgent(providerID = 0): Omit<Agent, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    description: '',
    system_prompt: '',
    provider_profile_id: providerID,
    enabled: false,
    trigger_type: 'manual',
    timezone: 'Asia/Shanghai',
    capabilities: [],
    execution_mode: 'advisory',
    max_steps: 6,
    max_input_tokens: 16000,
    max_output_tokens: 2000,
    daily_run_limit: 10,
    monthly_token_budget: 1000000,
  };
}
