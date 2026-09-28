export interface ExternalCapability {
  name: string;
  description: string;
  description_zh?: string;
  parameters?: unknown;
  configuration_schema?: unknown;
  default_binding?: unknown;
  output_schema?: unknown;
  surfaces?: string[];
  risk_level?: string;
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

export interface ExternalAPIInvocationAudit {
  id: number;
  client_id: number;
  request_id: string;
  capability: string;
  result: string;
  status_code: number;
  source_ip: string;
  input_digest: string;
  duration_ms: number;
  created_at: string;
}

export interface ExternalAPIClientInput {
  name: string;
  capabilities: string[];
  enabled: boolean;
  rate_limit_per_minute: number;
  expires_at: string | null;
}
