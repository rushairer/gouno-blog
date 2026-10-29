# Workflow JSON Schema external-resource boundary — 2026-10-29

Status: **candidate pending exact-head CI and release evidence**.

## Read-only finding on main `21cf2bd25a9c254f8a8de0691b301fda7c176e5a`

`internal/workflow/schema.go` constructed three `jsonschema/v5` compilers without setting a resource loader. Version 5.3.1 includes a default local-file loader; Workflow JSON Schemas are editable and can contain `$ref` references. Authoring validation, execution input validation and per-property default compilation must not resolve `file://` or other external references against the Blog process. The HTTP(S) loader is not imported by this repository, but defense must also hold if imports change.

## Candidate implementation and regression

- A shared `newWorkflowSchemaCompiler()` uses an explicit fail-closed `LoadURL` for all three call sites. Embedded `#/$defs/...` references remain resolvable through the in-memory resource.
- Unit regression creates a **readable, valid** external JSON Schema on disk and proves both authoring and execution reject its `file://` ref with `ErrInvalid`. A separate test checks standard 2020-12 schema declaration and embedded fragment compilation, including real input validation.
- No Connector behavior, API shape, BFF/authorization, database migrations, UI components or dependencies change.

## Acceptance restrictions

Do not claim this closes all indirect error paths or completes #359. Require exact-PR-head CI, PostgreSQL integration, Go race/vet/vulnerability scanning, image build/security scans and applicable workflow checks. Review merge result separately. Production deployment and #338 operator drills are separate gates.
