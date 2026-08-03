export type ProviderType = 'openai' | 'anthropic' | 'gemini';
export type TriggerType = 'manual' | 'cron';
export type ExecutionMode = 'advisory' | 'approval';
export type ContentPublishMode = 'draft' | 'approval' | 'publish';
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
  is_default_writing: boolean;
  is_default_image: boolean;
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
  type: 'resource_query' | 'model' | 'for_each' | 'approval_gate' | 'output';
  name?: string;
  agent_id?: number;
  input_pointer?: string;
  include_context?: boolean;
  collection_pointer?: string;
  max_items?: number;
  max_concurrency?: number;
  continue_on_error?: boolean;
  steps?: WorkflowStep[];
  output_pointer?: string;
  resource_type?: 'post' | 'comment' | 'media_asset' | 'operational_suggestion' | 'category' | 'tag';
  filter?: Record<string, unknown>;
}

export interface WorkflowScopePolicy {
  mode: 'strict' | 'unscoped';
  discovery_tools: string[];
}

export interface Workflow {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  cron_expression?: string;
  timezone: string;
  next_run_at?: string;
  template_key?: string;
  current_version: number;
  version_id: number;
  input_schema: Record<string, unknown>;
  steps: WorkflowStep[];
  scope_policy?: WorkflowScopePolicy;
  resource_query_preview?: Array<{ step_id: string; resource_type: string; estimated_count: number; max_items: number }>;
  resource_query_preview_at?: string;
  resource_query_last_count?: number;
  resource_query_last_run_at?: string;
  resource_query_empty_policy?: 'succeed' | 'fail';
  created_at: string;
  updated_at: string;
}

export interface WorkflowResource {
  id: number;
  workflow_run_id: number;
  type: string;
  key: string;
  source: 'manual' | 'query' | 'discovery';
  access_level: 'target' | 'read';
  label: string;
  version_token: string;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  workflow_version_id: number;
  dry_run: boolean;
  status: string;
  input: Record<string, unknown>;
  output?: unknown;
  error_code?: string;
  error_message?: string;
  input_tokens: number;
  output_tokens: number;
  triggered_by?: string;
  schedule_key?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

export interface WorkflowStepRun {
  id: number;
  workflow_run_id: number;
  step_id: string;
  step_type: string;
  iteration?: number;
  status: string;
  input?: unknown;
  output?: unknown;
  error_message?: string;
  started_at: string;
  finished_at?: string;
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
  status: 'new' | 'ignored' | 'converted' | 'selected' | 'resolved';
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

export interface EditorialTask {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'done' | 'cancelled';
  source_approval_id?: number;
  source_suggestion_id?: number;
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
  system_key?: string;
  name: string;
  description: string;
  provider_profile_id: number;
  skill_version_id: number;
  skill?: AgentSkill;
  enabled: boolean;
  trigger_type: TriggerType;
  cron_expression?: string;
  timezone: string;
  max_steps_override?: number;
  max_input_tokens_override?: number;
  max_output_tokens_override?: number;
  daily_run_limit: number;
  monthly_token_budget: number;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSkill {
  id: number;
  system_key?: string;
  name: string;
  description: string;
  system_prompt: string;
  capabilities: string[];
  tool_bindings: Record<string, Record<string, unknown>>;
  execution_mode: ExecutionMode;
  content_publish_mode: ContentPublishMode;
  max_steps: number;
  max_input_tokens: number;
  max_output_tokens: number;
  default_daily_run_limit: number;
  default_monthly_token_budget: number;
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
  description_zh?: string;
  parameters: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  configuration_schema?: Record<string, unknown>;
  surfaces: 'agent'[];
  risk_level: 'read' | 'propose' | 'write';
  scope?: {
    resource_type?: string;
    argument?: string;
    discovery?: boolean;
    output_resource_type?: string;
    output_keys?: string[];
  };
}

export type ConnectorKind = 'search_console' | 'newsletter' | 'social' | 'webhook';

export interface ConnectorProfile {
  id: number;
  name: string;
  kind: ConnectorKind;
  sandbox: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  credential_last4?: string;
  has_credential: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectorOutboxItem {
  id: number;
  connector_profile_id: number;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: 'awaiting_approval' | 'approved' | 'delivered' | 'failed' | 'revoked';
  attempts: number;
  error_message?: string;
  delivered_at?: string;
  revoked_at?: string;
  created_at: string;
}

export const emptyProvider: Omit<ProviderProfile, 'id' | 'created_at' | 'updated_at' | 'has_api_key' | 'api_key_last4'> & { api_key: string } = {
  name: '',
  provider_type: 'openai',
  base_url: 'https://api.openai.com',
  model: '',
  api_key: '',
  enabled: true,
  is_default_writing: false,
  is_default_image: false,
  request_timeout_seconds: 60,
  max_output_tokens: 2000,
};

export function emptyAgent(providerID = 0): Omit<Agent, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    description: '',
    provider_profile_id: providerID,
    skill_version_id: 0,
    enabled: false,
    trigger_type: 'manual',
    timezone: 'Asia/Shanghai',
    daily_run_limit: 10,
    monthly_token_budget: 1000000,
  };
}
