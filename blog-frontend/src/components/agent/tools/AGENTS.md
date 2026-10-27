# Governed Skill Tool Bindings editor invariants

Root `AGENTS.md` and the manual-first Gouno UI/Showcase parity policy remain authoritative.

- `ToolBindingsEditor` displays a local raw JSON draft, but `SkillForm` owns the accepted `tool_bindings` value and the eventual Save mutation. An invalid draft **must block Skill Save** rather than silently persisting previously accepted bindings.
- The top-level JSON value and every per-Tool binding must be a JSON object (not null, an array or a scalar). Invalid edits cannot call `onChange` or mutate accepted bindings. Frontend input validation is not authorization or a replacement for backend schema validation.
- Visual <-> JSON changes must preserve the latest *accepted* values. Returning to Visual Form discards an unapplied invalid draft, resets the local validation error and restores Save eligibility. Do not create another mutable source of truth for accepted values.
- Default binding initialization on selection must remain additive to existing Tool data; do not rewrite unrelated configuration. No user action can broaden a Tool permission or bypass Skill version approval policy.
- Keep unit tests with a controlled parent and the real Skill Save form, not only a mode-toggle assertion. Exercise malformed syntax, invalid nested values, valid JSON edits, mode round-trip and Save enable/disable behavior.
- A real rendered browser test must inspect desktop and mobile invalid/recovered states with no console exceptions. Because `src/components/agent/` is part of the verified AI Product ownership, any behavior change requires manual-first review and fresh Showcase parity certification before merging.
