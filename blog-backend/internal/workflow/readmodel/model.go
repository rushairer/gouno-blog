package readmodel

// Metric is the typed projection returned by the Workflow metrics read model.
// It lives in a neutral capability package so the consumer-owned port and its
// repository implementation do not depend on each other.
type Metric struct {
	WorkflowID int64
	Name       string
	Runs       int64
	Failures   int64
	Tokens     int64
}
