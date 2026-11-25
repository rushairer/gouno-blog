package domain

// TextDispatchAudit retains only local dispatch identity and bounded transport
// evidence. Its started state authorizes one HTTP call, but does not prove
// delivery. ResponseReceived is not decoded model success or billing evidence.
type TextDispatchAudit struct {
	ID                        int64
	RunID, AgentID             int64
	TurnRequestID              string
	Sequence                   int
	ProviderProfileID          int64
	ProviderType, Vendor       string
	Model, ConfigFingerprint   string
	Operation, StreamFlag      string
	Status                     string
	HTTPStatus                 int
	UpstreamRequestID          string
	UpstreamAccountID          string
	UpstreamWorkspaceID        string
}
