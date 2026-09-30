export interface ExternalCapability {
  name: string;
  description: string;
  description_zh?: string;
  parameters: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  surfaces: string[];
  risk_level: "read";
  scope?: Record<string, unknown>;
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

export interface ExternalInvocationAudit {
  id: number;
  client_id: number;
  request_id: string;
  capability: string;
  result: "success" | "denied" | "failed" | "rate_limited";
  status_code: number;
  source_ip: string;
  input_digest: string;
  duration_ms: number;
  created_at: string;
}

export interface ExternalAPIClientCreateRequest {
  name: string;
  capabilities: string[];
  enabled?: boolean;
  rate_limit_per_minute?: number;
  expires_at?: string | null;
}

export interface ExternalAPIClientUpdateRequest {
  name: string;
  capabilities: string[];
  enabled: boolean;
  rate_limit_per_minute?: number;
  expires_at?: string | null;
}
