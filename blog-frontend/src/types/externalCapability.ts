export type ExternalCapabilityRisk = "read";

export interface ExternalCapabilityScope {
  resource_type?: string;
  argument?: string;
  allows_create?: boolean;
  discovery?: boolean;
  output_resource_type?: string;
  output_keys?: string[];
}

export interface ExternalCapability {
  name: string;
  description: string;
  description_zh?: string;
  parameters: Record<string, unknown>;
  configuration_schema?: Record<string, unknown>;
  default_binding?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  surfaces: string[];
  risk_level: ExternalCapabilityRisk;
  scope?: ExternalCapabilityScope;
}

export interface ExternalAPIClient {
  id: number;
  name: string;
  key_prefix: string;
  capabilities: string[];
  enabled: boolean;
  rate_limit_per_minute: number;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_by_principal_id?: number | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalAPICreatedClient {
  client: ExternalAPIClient;
  api_key: string;
}

export type ExternalInvocationResult =
  | "success"
  | "denied"
  | "failed"
  | "rate_limited";

export interface ExternalInvocationAudit {
  id: number;
  client_id: number;
  request_id: string;
  capability: string;
  result: ExternalInvocationResult;
  status_code: number;
  source_ip: string;
  input_digest: string;
  duration_ms: number;
  created_at: string;
}

export interface ExternalAPIClientCreateInput {
  name: string;
  capabilities: string[];
  enabled: boolean;
  rate_limit_per_minute: number;
  expires_at?: string | null;
}

export interface ExternalAPIClientUpdateInput
  extends ExternalAPIClientCreateInput {}
