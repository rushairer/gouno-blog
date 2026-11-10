# Connector JSON transport confidentiality repair — 2026-11-10

Scope: the user instructed “你去弄啊！” in direct response to the final closeout
request explicitly listing this bounded Connector JSON-error repair. This
authorizes the named repair in that context; it does not unfreeze OAuth,
credential lifecycle, integrations, delivery, Sandbox or any product feature.

Four actual handlers previously reflected decoder details through err.Error():
SaveConnectorProfile, CompleteConnectorOAuth, SearchConsoleSummary and
QueueConnectorOutbox. Unknown private property names and Go schema types were
returned to clients; all body-limit failures became400.

Use the existing safe shared WriteJSONBindingError transport. Invalid inputs
return fixed400 `invalid request body`; http.MaxBytesError returns fixed413
`request body too large`. Preserve second-decode errors so oversized trailing
whitespace retains413 instead of losing its size classification. Unknown
fields, malformed or multiple JSON objects remain rejected. No auth middleware,
service, route registration, frontend, database, dependency or body limit changes.

The real-handler regression has28 cases: four handlers times unknown private
field, malformed input, type mismatch, second object, malformed trailing input,
oversized value and oversized trailing whitespace. Bodies use the actual2MiB
limit with unknown Content-Length. Service is absent, so any service dispatch
fails the test; every error must abort the Gin chain with exact safe wording.
The original implementation fails these cases; the repaired handlers pass.
A positive binding control retains empty/single objects, Unicode and legal
trailing whitespace. Existing Connector service and shared transport race tests,
full backend race tests, vet and module verification pass locally. CI must
independently pass the final commit, database integration and image gates.

This closes the observed decoder-response issue only. It is not complete
Connector production certification, a general hold exception, a Showcase
maintainer approval, a Staging receipt or a formal v1.6.0 release.
