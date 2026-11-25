package agent

import (
	"context"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
)

// One observer belongs to one logical model turn. Negotiation and Agent
// retries share its sequence, while distinct turns never share an identity.
type runTextDispatchAudit struct {
	store    RunnerRunStore
	base     domain.TextDispatchAudit
	sequence int
}

func newRunTextDispatchAudit(store RunnerRunStore, runID, agentID int64, requestID string, profile *providerdomain.ProviderProfile) *runTextDispatchAudit {
	vendor := profile.Vendor
	if vendor == "" {
		vendor = providerdomain.DefaultVendor(profile.ProviderType)
	}
	return &runTextDispatchAudit{store: store, base: domain.TextDispatchAudit{
		RunID: runID, AgentID: agentID, TurnRequestID: requestID,
		ProviderProfileID: profile.ID, ProviderType: string(profile.ProviderType),
		Vendor: string(vendor), Model: profile.Model, ConfigFingerprint: providerConfigFingerprint(profile),
	}}
}

func (a *runTextDispatchAudit) Start(ctx context.Context, dispatch provider.TextDispatch) (int64, error) {
	a.sequence++
	row := a.base
	row.Sequence, row.Operation, row.StreamFlag = a.sequence, dispatch.Operation, dispatch.StreamFlag
	if err := a.store.StartTextDispatch(ctx, &row); err != nil {
		return 0, err
	}
	return row.ID, nil
}

func (a *runTextDispatchAudit) Finish(ctx context.Context, id int64, outcome provider.TextDispatchOutcome) error {
	row := a.base
	row.ID, row.Status, row.HTTPStatus = id, outcome.Status, outcome.HTTPStatus
	row.UpstreamRequestID = outcome.Evidence.RequestID
	row.UpstreamAccountID = outcome.Evidence.AccountID
	row.UpstreamWorkspaceID = outcome.Evidence.WorkspaceID
	return a.store.FinishTextDispatch(ctx, &row)
}

func (a *runTextDispatchAudit) Complete(ctx context.Context, id int64, outcome provider.TextDispatchDecodeOutcome) error {
	row := a.base
	row.ID, row.DecodeStatus = id, outcome.Status
	return a.store.CompleteTextDispatch(ctx, &row)
}
