# Provider text negotiation

The repository-root AGENTS.md is authoritative. Preserve its image-generation no-replay and request-evidence rules.

- OpenAI text streaming negotiation is shared by Responses and Chat Completions. Auto may retry with `stream:true` once only after the typed HTTP 400/422 classifier explicitly requires streaming. Never broaden this to every error containing `stream`.
- Return and unwrap the error from the request that actually failed. Do not replace a failed streaming request with the initial non-streaming 400, or retain that obsolete error as the primary cause. `errors.Is`, `errors.As`, retry classification and request evidence must select the final attempt.
- Explicit `never` serializes `stream:false`, never enables streaming, and identifies a required-stream configuration conflict. Explicit `always` serializes `stream:true` from the first request. A repeated rejection of an already-streaming request must state that true was sent, without looping.
- Legacy auto text-protocol discovery is allowed only for an initial HTTP 404/405. Do not switch protocols after authentication, quota, upstream 5xx, transport/decode errors, or after the selected endpoint already required streaming. Known Chat-only gateways should explicitly select `chat_completions`.
- Text negotiation helpers must not be used to reintroduce image-generation fallback or replay. Do not add generic idempotency headers or forward OpenAI-only client request identifiers to compatible gateways.
- Retain `openai_negotiation_test.go` alongside existing successful stream/tool-call tests. Count actual HTTP requests and assert final error type, status, request evidence and explicit stream flags; a happy-path fallback test alone is insufficient.
- A merged commit or successful image publication does not prove that a production container runs it. Never claim a live upstream incident is resolved without a new run and independently verified deployment identity.
