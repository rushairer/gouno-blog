# Integration Hub v1

Status: implementation in progress  
Started: 2026-09-26

## Product goal

Integration Hub turns the historical Connector sandbox into a production integration boundary with two independent directions:

1. **Inbound model connectivity** — Blog calls domestic and international AI model platforms through a small set of protocol adapters.
2. **Outbound Blog capabilities** — external AI systems and services can call explicitly granted Blog capabilities without gaining browser/BFF credentials or unrestricted admin APIs.

The two directions share secret handling, auditability, rate limits and operator governance, but they do not share lifecycle tables or authorization semantics.

## Architecture

```text
AI Settings / Model Connections
        |
        v
Provider Profile
  vendor + protocol + endpoint + model + encrypted key
        |
        +--> OpenAI-compatible adapter
        +--> Anthropic Messages adapter
        +--> Gemini native adapter

Integration Hub
        |
        +--> Connector Profiles / OAuth / delivery / Outbox
        |
        +--> External API Clients
               |
               +--> scoped capability catalog
               +--> API key authentication
               +--> invocation audit + rate limits
               +--> Tool Registry external-safe surface
               +--> MCP transport (next phase)
```

## Model provider rule

Vendor identity and wire protocol are separate concepts.

A vendor preset may choose a default protocol and base URL, but the runtime dispatcher continues to depend on protocol family only:

- `openai` — OpenAI Responses / Chat Completions and compatible APIs.
- `anthropic` — Anthropic Messages and compatible APIs.
- `gemini` — Gemini native generateContent / predict.

Initial vendor catalog:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Alibaba Bailian / Qwen
- Volcengine Ark / Doubao
- Tencent Hunyuan
- Baidu Qianfan
- Moonshot / Kimi
- Zhipu GLM
- SiliconFlow
- MiniMax
- Custom

The platform field is metadata and preset identity. A new OpenAI-compatible platform must not require a new HTTP adapter.

## Compatible API-root rule

A configured Base URL is treated as an **API root**.

- A host-only OpenAI-compatible URL keeps backward compatibility and receives the standard `/v1` prefix.
- A Base URL whose path already names an API root (for example `/v1`, `/v2`, `/api/v3`, `/api/paas/v4`, or `/compatible-mode/v1`) receives only the operation suffix such as `/chat/completions` or `/responses`.
- Redirects remain rejected and the existing SSRF-safe DNS/IP checks remain in force.

## External Capability Gateway v1

The browser BFF continues to reject provider bearer tokens. External integrations get a separate data-plane identity.

### API client credential

- randomly generated high-entropy secret;
- returned only at create/rotate time;
- database stores a lookup prefix plus SHA-256 digest, never the raw key;
- constant-time digest comparison;
- revocation and enabled state are immediate;
- last-used timestamp and rate-limit policy are recorded.

### Capability authorization

The Tool Registry remains the implementation owner. A capability is externally invokable only when:

1. its definition explicitly includes the `external` surface;
2. the API client grant contains that exact capability;
3. its risk class is allowed by the External Gateway.

v1 exposes **read-only** capabilities first. Direct `write` tools are never exported. `propose` tools stay disabled until their external invocation path can persist the same human-approval evidence as an internal Agent run.

Initial external-safe candidates:

- `content.search_posts`
- `content.search_knowledge`
- `content.list_tags`
- `content.list_categories`
- `analytics.get_summary`

### Data-plane API

Planned v1:

- `GET /api/external/v1/capabilities`
- `POST /api/external/v1/capabilities/:name/invoke`

MCP over Streamable HTTP is the next transport over the same client/grant/audit layer; MCP does not get a second authorization model.

### Audit

Every external invocation records:

- API client id;
- request id;
- capability;
- risk;
- success/failure status;
- latency;
- bounded argument/result metadata;
- error code;
- timestamp.

Raw API keys, provider credentials, Blog browser sessions and private identity fields must never enter audit payloads.

## Product IA

- **AI Settings → Model Connections** owns model vendors/protocols/models/keys/default usage.
- **Integrations & APIs** becomes a dedicated Admin route for Connector profiles, Outbox, API/MCP clients and invocation audit.
- Historical `/admin/ai-settings?section=connectors` remains a compatibility entry and redirects/links to the Integration Hub.
- Search Console remains server-side OAuth/PKCE. Browser code never receives Google refresh/access tokens.

## Delivery phases

1. Provider vendor catalog + compatible API-root support.
2. External Capability Gateway client/grant/audit baseline.
3. Dedicated Integrations & APIs Admin UI + old-route compatibility.
4. Remote MCP transport on the Gateway.
5. Production outbound Connector transports (webhook/content distribution) with approval, idempotency and delivery audit.
6. Canonical Showcase/manual parity review and certification restoration.

Each phase must keep tests, OpenAPI and security documentation synchronized.
