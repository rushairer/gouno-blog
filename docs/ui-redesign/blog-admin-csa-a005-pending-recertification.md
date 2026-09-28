# Blog Admin CSA-A005 Consumer Recertification Staging

Status: **needs-manual-recertification**

Date: 2026-09-28

## Trigger

Gouno UI CSA-A005 changed the canonical Blog Admin Model Connection contract so commercial/model vendor identity is independent from the wire protocol family. The accepted canonical amendment is commit `aa0c113ec0ca4ee02a9cd79f35eb0a9389488b77`, contained in reviewed Gouno UI main ref `9a1aa7ebf897525856a49642db8e7a63b2d1088d`.

The Blog consumer implementation was reviewed at exact Product head `ec92d2748f186b0831cce6f78df913d1676506cf` and merged through PR #295.

## Manual review

The Product and Canonical AI Settings Model Connection surfaces were re-read directly before recording this evidence. The review covered composition, typography, spacing, feedback semantics, interaction/action grammar, responsive behavior and the privileged settings boundary.

Observed and accepted Product behavior:

- Vendor and protocol are now separate concepts throughout the Provider editor and display surface.
- Provider cards render human-facing vendor/protocol labels rather than exposing internal enum values.
- The Provider editor retains the existing privileged settings composition and real credential lifecycle.
- The vendor catalogue covers OpenAI, Anthropic, Google/Gemini, DeepSeek, Alibaba/Qwen, Volcengine/Doubao, Moonshot/Kimi, Tencent/Hunyuan, Zhipu GLM, Baidu Qianfan, MiniMax, xAI, Mistral and custom-compatible services.
- Wire protocol remains the compatibility contract (`openai`, `anthropic`, `gemini`); vendor choice does not silently rewrite protocol behavior.
- Existing Connector OAuth/credential/Outbox behavior and Agent/Workflow evidence remain intentional Product behavior outside the A005 Provider contract.
- The final visual pass caught and corrected one real drift before staging: Product Provider cards were still rendering raw vendor/protocol enum values instead of Canonical user-facing labels.

No manual review finding requires another Product source change before the reciprocal recertification handshake.

## Exact-head automated evidence

All required Product gates passed on `ec92d2748f186b0831cce6f78df913d1676506cf`:

- CI run `36404210434`: **success**.
- Blog Showcase Parity run `36404210431`: **success**.
- UI Browser Acceptance run `36404210415`: **success**.
- Images run `36404210362`: **success**.
- Gosso Release BFF Compatibility run `36404210429`: **success**.

Retained artifacts:

- Paired Showcase parity artifact `10962245898`, `sha256:fbde8c8b10e616aad5e4d92efd9da86b63d3f32c786bbcb28268dce61367b004`.
- Browser acceptance artifact `10961722110`, `sha256:c5fad0ed2fef0e9ae5da0b1e6dcdd0ccf406436b2ad026c140c6c8b7ee640e26`.

## Why status remains pending

This document intentionally does **not** promote the Blog certification to `verified`.

The cross-repository amendment handshake requires the following order:

1. Blog Product implementation and fresh evidence land while the local certification remains `needs-manual-recertification`.
2. Gouno UI marks CSA-A005 `consumerImpact.rushairer/gouno-blog` as `recertified` and reciprocal parity runs against the merged Blog main implementation.
3. Only after that upstream state lands may Blog promote its local `blog-admin-ai` certification back to `verified`.

The current state therefore records completed Product review evidence without claiming completed reciprocal certification.
