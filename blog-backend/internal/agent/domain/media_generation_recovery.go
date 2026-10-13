package domain

import (
	"regexp"
	"strings"
)

// A reference is a short incident/support ticket identifier, never a URL
// containing credentials, arbitrary text or a raw Provider error. The same
// format is enforced at the PostgreSQL persistence boundary.
var recoveryEvidenceReferencePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/#-]{11,199}$`)

// ValidMediaGenerationRecoveryEvidence verifies that a trusted human reviewer
// explicitly attested all required checks before attempting the state change.
// It does not establish Provider-side idempotency or prove billing status.
func ValidMediaGenerationRecoveryEvidence(value *MediaGenerationRecoveryDecision) bool {
	return value != nil &&
		value.CandidateID > 0 && value.GenerationAttempt > 0 &&
		value.ReviewerPrincipalID > 0 &&
		value.VerifiedProviderOutcome &&
		value.VerifiedObjectStorage &&
		value.AcknowledgedPossibleBilling &&
		recoveryEvidenceReferencePattern.MatchString(strings.TrimSpace(value.EvidenceReference))
}
