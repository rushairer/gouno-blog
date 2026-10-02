const now = "2026-09-13T12:00:00Z";

export const aiProvider = {
  id: 1,
  name: "OpenAI Primary",
  provider_type: "openai",
  base_url: "https://api.openai.com",
  model: "gpt-5.6",
  api_key_last4: "1234",
  has_api_key: true,
  enabled: true,
  is_default_writing: true,
  is_default_image: false,
  request_timeout_seconds: 60,
  max_output_tokens: 8000,
  created_at: now,
  updated_at: now,
};

export const externalCapabilities = [
  {
    name: "content.list_published_posts",
    description: "List published Blog posts through the public content boundary.",
    description_zh: "通过公开内容边界分页读取已发布文章。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.get_published_post",
    description: "Read one published Blog post by numeric ID.",
    description_zh: "按数字 ID 读取一篇已发布文章。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.list_published_pages",
    description: "List published custom pages.",
    description_zh: "读取已发布单页目录。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.search_posts",
    description: "Search published Blog content.",
    description_zh: "检索已发布 Blog 内容。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "content.search_knowledge",
    description: "Search indexed published content.",
    description_zh: "检索已建立索引的已发布内容。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
  {
    name: "analytics.list_low_engagement_posts",
    description: "List published posts with low engagement.",
    description_zh: "读取低互动的已发布文章清单。",
    parameters: { type: "object", additionalProperties: false },
    surfaces: ["external"],
    risk_level: "read",
  },
];

export const externalApiClients = [
  {
    id: 91,
    name: "Editorial Reporting SDK",
    key_prefix: "gouno_live_A7k3Q2p9",
    capabilities: [
      "content.list_published_posts",
      "content.get_published_post",
      "analytics.list_low_engagement_posts",
    ],
    enabled: true,
    rate_limit_per_minute: 120,
    expires_at: "2026-12-31T15:59:00Z",
    last_used_at: "2026-09-28T05:42:00Z",
    revoked_at: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 92,
    name: "Knowledge Export Worker",
    key_prefix: "gouno_live_K9m2V6s4",
    capabilities: ["content.search_posts", "content.search_knowledge"],
    enabled: false,
    rate_limit_per_minute: 30,
    expires_at: null,
    last_used_at: "2026-09-27T14:16:00Z",
    revoked_at: null,
    created_at: now,
    updated_at: now,
  },
];

export const externalApiAudits = [
  {
    id: 701,
    client_id: 91,
    request_id: "req-701",
    capability: "analytics.list_low_engagement_posts",
    result: "success",
    status_code: 200,
    source_ip: "203.0.113.10",
    input_digest: "fixture-digest-701",
    duration_ms: 42,
    created_at: "2026-09-28T05:42:18Z",
  },
  {
    id: 702,
    client_id: 91,
    request_id: "req-702",
    capability: "content.get_published_post",
    result: "success",
    status_code: 200,
    source_ip: "203.0.113.10",
    input_digest: "fixture-digest-702",
    duration_ms: 31,
    created_at: "2026-09-28T05:41:52Z",
  },
  {
    id: 703,
    client_id: 92,
    request_id: "req-703",
    capability: "content.get_published_post",
    result: "denied",
    status_code: 403,
    source_ip: "203.0.113.11",
    input_digest: "fixture-digest-703",
    duration_ms: 1,
    created_at: "2026-09-27T14:16:04Z",
  },
];

export const connectorProfiles = [
  {
    id: 31,
    name: "Web Research Sandbox",
    kind: "search_console",
    sandbox: true,
    enabled: true,
    config: { scope: "read-only public research" },
    credential_last4: "3412",
    has_credential: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 32,
    name: "Media Sandbox",
    kind: "webhook",
    sandbox: true,
    enabled: true,
    config: { scope: "media candidates and generated assets" },
    credential_last4: "7821",
    has_credential: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 33,
    name: "Source Archive",
    kind: "newsletter",
    sandbox: true,
    enabled: false,
    config: { scope: "historical source archive" },
    has_credential: false,
    created_at: now,
    updated_at: now,
  },
];

export const connectorOutbox = [
  {
    id: 301,
    connector_profile_id: 32,
    idempotency_key: "run-702-media-preview",
    payload: { run_id: 702, action: "preview" },
    status: "awaiting_approval",
    attempts: 0,
    created_at: now,
  },
  {
    id: 302,
    connector_profile_id: 33,
    idempotency_key: "run-698-source-sync",
    payload: { run_id: 698, action: "sync" },
    status: "failed",
    attempts: 1,
    error_message: "Sandbox mock timeout",
    created_at: now,
  },
  {
    id: 303,
    connector_profile_id: 31,
    idempotency_key: "run-690-search-console",
    payload: { run_id: 690, action: "inspect" },
    status: "delivered",
    attempts: 1,
    delivered_at: now,
    created_at: now,
  },
];

export const embeddingProfile = {
  id: 1,
  name: "Primary Embeddings",
  base_url: "https://api.openai.com",
  model: "text-embedding-3-large",
  dimensions: 3072,
  api_key_last4: "5678",
  has_api_key: true,
  enabled: true,
  request_timeout_seconds: 30,
  created_at: now,
  updated_at: now,
};

export const aiSkill = {
  id: 1,
  name: "Editorial Operations",
  description: "Audit and improve long-form editorial content.",
  system_prompt: "Produce evidence-backed editorial recommendations.",
  capabilities: ["content.list_posts", "content.audit_post"],
  tool_bindings: {},
  execution_mode: "approval",
  content_publish_mode: "approval",
  max_steps: 8,
  max_input_tokens: 32000,
  max_output_tokens: 8000,
  default_daily_run_limit: 20,
  default_monthly_token_budget: 2000000,
  version: 3,
  version_id: 3,
  input_schema: { type: "object", properties: { topic: { type: "string" } } },
  allowed_triggers: ["manual", "cron"],
  created_at: now,
  updated_at: now,
};

export const aiAgents = [
  {
    id: 1,
    name: "Editorial Operations",
    description: "Runs editorial quality checks and proposes improvements.",
    provider_profile_id: 1,
    skill_version_id: 3,
    skill: aiSkill,
    enabled: true,
    trigger_type: "manual",
    timezone: "Asia/Taipei",
    daily_run_limit: 20,
    monthly_token_budget: 2000000,
    created_at: now,
    updated_at: now,
  },
  {
    id: 2,
    name: "Disabled Archive Assistant",
    description: "Disabled fixture used to verify non-active state rendering.",
    provider_profile_id: 1,
    skill_version_id: 3,
    skill: aiSkill,
    enabled: false,
    trigger_type: "cron",
    cron_expression: "0 3 * * *",
    timezone: "Asia/Taipei",
    daily_run_limit: 5,
    monthly_token_budget: 500000,
    created_at: now,
    updated_at: now,
  },
];

export const aiTools = [
  {
    name: "content.list_posts",
    description: "List posts for editorial analysis.",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
    risk_level: "read",
  },
  {
    name: "content.audit_post",
    description: "Audit one post and return structured quality evidence.",
    parameters: { type: "object", properties: { post_id: { type: "integer" } } },
    risk_level: "read",
  },
  {
    name: "analytics.list_low_engagement_posts",
    description: "List published posts with enough traffic but low engagement.",
    parameters: { type: "object", properties: {} },
    risk_level: "read",
  },
];

export const longNarrative = [
  "## Long-form execution result",
  "",
  ...Array.from({ length: 18 }, (_, index) =>
    `### Finding ${index + 1}\n\nThis paragraph intentionally contains enough detail to exercise wrapping, vertical density, Markdown rendering, and responsive behavior across narrow and wide viewports. Evidence remains readable without forcing document-level horizontal scrolling.`,
  ),
  "",
  "```text",
  "LONG_UNBROKEN_DIAGNOSTIC_TOKEN_".repeat(18),
  "```",
  "",
  "| Signal | Observation | Action |",
  "| --- | --- | --- |",
  "| Coverage | Long output is present | Keep internal overflow contained |",
  "| Mobile | Narrow viewport is exercised | Avoid page-level horizontal scroll |",
].join("\n");

export const agentRuns = Array.from({ length: 14 }, (_, index) => ({
  id: 101 + index,
  agent_id: index % 2 === 0 ? 1 : 2,
  trigger_type: index % 3 === 0 ? "cron" : "manual",
  status: index === 3 ? "failed" : index === 5 ? "cancelled" : "succeeded",
  output_summary: index === 0 ? longNarrative : `Run ${index + 1} completed with retained audit evidence.`,
  provider: "openai",
  model: "gpt-5.6",
  input_tokens: 1200 + index * 17,
  output_tokens: 800 + index * 23,
  ...(index === 3
    ? { error_code: "fixture_failure", error_message: "Injected failed run for rendered failure-state acceptance." }
    : {}),
  started_at: `2026-09-13T10:${String(index).padStart(2, "0")}:00Z`,
  finished_at: `2026-09-13T10:${String(index).padStart(2, "0")}:05Z`,
  created_at: `2026-09-13T10:${String(index).padStart(2, "0")}:00Z`,
}));

export const agentRunDetail = {
  run: agentRuns[0],
  tool_calls: [
    {
      id: 501,
      run_id: agentRuns[0].id,
      tool_name: "content.list_posts",
      risk_level: "read",
      arguments: { limit: 100, cursor: "fixture-long-result" },
      result: { output_summary: longNarrative },
      status: "executed",
      created_at: now,
    },
  ],
};

export const approvals = [
  {
    id: 701,
    run_id: agentRuns[3].id,
    tool_call_id: 601,
    action_type: "create_draft",
    target_type: "post",
    status: "failed",
    review_note: "Injected approval failure remains actionable and visibly explained.",
    proposed_payload: {
      title: "Long approval preview",
      slug: "long-approval-preview",
      summary: "A governed proposal with a long Markdown body for browser acceptance.",
      content: longNarrative,
    },
    expires_at: "2026-09-20T00:00:00Z",
    created_at: now,
  },
  {
    id: 702,
    run_id: agentRuns[0].id,
    tool_call_id: 602,
    action_type: "update_post",
    target_type: "post",
    target_id: 42,
    status: "pending",
    proposed_payload: {
      title: "Pending editorial proposal",
      content: "## Pending proposal\n\nReview before applying this change.",
    },
    expires_at: "2026-09-20T00:00:00Z",
    created_at: now,
  },
];

export const workflows = [
  {
    id: 4,
    name: "AI Daily Briefing",
    description: "A representative workflow with a long-output run history.",
    enabled: true,
    timezone: "Asia/Taipei",
    current_version: 3,
    version_id: 8,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" }, max_items: { type: "integer" } },
    },
    steps: [
      { id: "sources", type: "model", name: "Collect and summarize", agent_id: 1 },
      { id: "output", type: "output", name: "Publish result", output_pointer: "/summary" },
    ],
    scope_policy: { mode: "strict", discovery_tools: ["content.list_posts"] },
    created_at: now,
    updated_at: now,
  },
  {
    id: 5,
    name: "Disabled Weekly Audit",
    description: "Disabled workflow fixture.",
    enabled: false,
    timezone: "Asia/Taipei",
    current_version: 1,
    version_id: 9,
    input_schema: { type: "object" },
    steps: [],
    created_at: now,
    updated_at: now,
  },
];

export const workflowRuns = Array.from({ length: 14 }, (_, index) => ({
  id: 201 + index,
  workflow_id: index % 2 === 0 ? 4 : 5,
  workflow_version_id: index % 2 === 0 ? 8 : 9,
  dry_run: index % 4 === 0,
  status: index === 4 ? "failed" : index === 6 ? "waiting_for_user" : "succeeded",
  input: { topic: `Fixture topic ${index + 1}`, max_items: 50 },
  output:
    index === 0
      ? { output_summary: longNarrative, diagnostics: { opaque: "WIDE_DIAGNOSTIC_".repeat(22) } }
      : { output_summary: `Workflow run ${index + 1} completed.` },
  ...(index === 4
    ? { error_code: "step_failed", error_message: "Injected workflow failure for rendered state coverage." }
    : {}),
  input_tokens: 2200 + index * 31,
  output_tokens: 1400 + index * 19,
  triggered_by: "visual-reviewer",
  started_at: `2026-09-13T09:${String(index).padStart(2, "0")}:00Z`,
  finished_at: `2026-09-13T09:${String(index).padStart(2, "0")}:08Z`,
  created_at: `2026-09-13T09:${String(index).padStart(2, "0")}:00Z`,
}));

export const workflowMetrics = workflows.map((workflow, index) => ({
  workflow_id: workflow.id,
  name: workflow.name,
  runs: 14 - index,
  failures: index + 1,
  tokens: 64000 + index * 1000,
}));

export const workflowRunSteps = [
  {
    id: 801,
    workflow_run_id: workflowRuns[0].id,
    step_id: "sources",
    step_type: "model",
    iteration: 0,
    status: "succeeded",
    input: { max_items: 50, topic: "A deliberately wide structured input" },
    output: { output_summary: longNarrative, diagnostic_key: "STEP_DIAGNOSTIC_".repeat(20) },
    started_at: "2026-09-13T09:00:00Z",
    finished_at: "2026-09-13T09:00:06Z",
  },
];

export const workflowRunResources = [
  {
    id: 901,
    workflow_run_id: workflowRuns[0].id,
    type: "post",
    key: "42",
    source: "query",
    access_level: "read",
    label: "Representative long-form editorial source",
    version_token: now,
    snapshot: { status: "published", slug: "representative-long-form-editorial-source" },
    created_at: now,
  },
];

export const workflowInteractions = [
  {
    id: 1001,
    workflow_run_id: workflowRuns[0].id,
    workflow_step_id: "approval",
    interaction_type: "preview_confirm",
    schema: { type: "object" },
    payload: { title: "Preview confirmation", summary: "Review the generated output before continuing." },
    options: [],
    status: "pending",
    resume_token: "fixture-resume-token",
    expires_at: "2026-09-20T00:00:00Z",
    created_at: now,
  },
];

export const workflowRunEvents = [
  {
    id: 1101,
    workflow_run_id: workflowRuns[0].id,
    workflow_step_id: "sources",
    event_type: "long_output_created",
    payload: { chars: longNarrative.length },
    created_at: now,
  },
];

export const suggestions = [
  {
    id: 1201,
    source_type: "content_audit",
    source_key: "fixture",
    title: "Improve long-form article structure",
    description: "Evidence-backed operational suggestion for browser acceptance.",
    priority: "high",
    evidence: { post_id: 42 },
    status: "new",
    created_at: now,
    updated_at: now,
  },
];

export const indexStatus = {
  indexed_posts: 128,
  queued: 7,
  failed: 2,
  chunks: 12345,
  retrieval_p95_ms_24h: 112,
};

export const indexedKnowledgeContent = [
  {
    post_id: 201,
    title: "OAuth 2.1 and PKCE",
    slug: "oauth-pkce-browser-security",
    chunks: 24,
    status: "ready",
    last_indexed_at: now,
  },
  {
    post_id: 198,
    title: "BFF business sessions",
    slug: "bff-business-session",
    chunks: 18,
    status: "ready",
    last_indexed_at: now,
  },
];

export const knowledgeSearchResponse = {
  query: "Why is PKCE important?",
  latency_ms: 48,
  results: [
    {
      citation_id: "kb_fixture",
      chunk_id: 901,
      post_id: 201,
      title: "OAuth 2.1 and PKCE",
      slug: "oauth-pkce-browser-security",
      snippet:
        "The client keeps the high-entropy code_verifier private and sends only its derived code_challenge during authorization.",
      start_offset: 0,
      end_offset: 121,
      lexical_score: 0.78,
      semantic_score: 0.94,
      score: 0.88,
    },
  ],
};
