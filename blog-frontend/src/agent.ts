export type ProviderType = 'openai' | 'anthropic';
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

export interface Agent {
  id: number;
  name: string;
  description: string;
  system_prompt: string;
  provider_profile_id: number;
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
