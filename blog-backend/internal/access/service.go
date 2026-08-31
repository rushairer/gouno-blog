// Package access owns Blog-local membership and authorization. GOSSO remains
// the identity provider; no passwords, sessions, or refresh credentials live here.
package access

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lib/pq"
)

const (
	RoleOwner     = "owner"
	RoleAdmin     = "admin"
	RoleEditor    = "editor"
	RoleAuthor    = "author"
	RoleModerator = "moderator"

	PermissionManageMembers = "members.manage"
	PermissionManageSite    = "site.manage"
	PermissionManageAI      = "ai.manage"
	PermissionManageContent = "content.manage"
	PermissionAuthorContent = "content.author"
	PermissionModerate      = "community.moderate"
)

var ErrForbidden = errors.New("forbidden")
var ErrLastOwner = errors.New("cannot remove the last owner")
var ErrOwnerOnly = errors.New("owner role changes require an owner")
var ErrSelfEscalation = errors.New("cannot grant owner to yourself")
var ErrIdentityAliasConflict = errors.New("identity alias is already bound to a different principal")

type Bootstrap struct {
	Issuer, Subject string
}

type Principal struct {
	ID          int64  `json:"id"`
	Issuer      string `json:"issuer"`
	Subject     string `json:"subject"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

type Snapshot struct {
	Principal            Principal `json:"principal"`
	MembershipStatus     string    `json:"membership_status"`
	Roles                []string  `json:"roles"`
	Permissions          []string  `json:"permissions"`
	AuthorizationVersion int64     `json:"authorization_version"`
}

func (s *Snapshot) HasPermission(permission string) bool {
	if s == nil || s.MembershipStatus != "active" {
		return false
	}
	return has(s.Permissions, permission)
}

func (s *Snapshot) HasAnyPermission(permissions ...string) bool {
	if s == nil || s.MembershipStatus != "active" {
		return false
	}
	for _, p := range permissions {
		if has(s.Permissions, p) {
			return true
		}
	}
	return false
}

func (s *Snapshot) HasRole(role string) bool {
	if s == nil || s.MembershipStatus != "active" {
		return false
	}
	return has(s.Roles, role)
}

type Member struct{ Snapshot }

type Audit struct {
	ID        int64           `json:"id"`
	Action    string          `json:"action"`
	Result    string          `json:"result"`
	Actor     *Principal      `json:"actor,omitempty"`
	Target    *Principal      `json:"target,omitempty"`
	Before    json.RawMessage `json:"before"`
	After     json.RawMessage `json:"after"`
	RequestID string          `json:"request_id,omitempty"`
	SessionID string          `json:"session_id,omitempty"`
	SourceIP  string          `json:"source_ip,omitempty"`
	Reason    string          `json:"reason,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// IdentityAliasApproval is an explicit, operator-attested cross-issuer identity
// mapping. Equal subject text is intentionally not evidence of identity.
type IdentityAliasApproval struct {
	LegacyIssuer      string
	LegacySubject     string
	NewIssuer         string
	NewSubject        string
	ApprovedBy        string
	EvidenceReference string
}

type Service struct {
	db        *sql.DB
	bootstrap Bootstrap
}

func NewService(db *sql.DB, bootstrap Bootstrap) *Service {
	return &Service{db: db, bootstrap: bootstrap}
}

func (s *Service) resolvePrincipal(ctx context.Context, tx *sql.Tx, issuer, subject, display, email, avatar string) (Principal, error) {
	var p Principal
	load := func(identityIssuer string) error {
		return tx.QueryRowContext(ctx, `SELECT p.id,p.issuer,p.subject,p.display_name,p.email
FROM blog_principal_identities i
JOIN blog_principals p ON p.id=i.principal_id
WHERE i.issuer=$1 AND i.subject=$2
FOR UPDATE OF p`, identityIssuer, subject).Scan(&p.ID, &p.Issuer, &p.Subject, &p.DisplayName, &p.Email)
	}

	err := load(issuer)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `INSERT INTO blog_principals (issuer,subject,display_name,email,avatar_url)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (issuer,subject) DO UPDATE SET last_seen_at=NOW()
RETURNING id,issuer,subject,display_name,email`, issuer, subject, display, email, avatar).
			Scan(&p.ID, &p.Issuer, &p.Subject, &p.DisplayName, &p.Email)
		if err == nil {
			_, err = tx.ExecContext(ctx, `INSERT INTO blog_principal_identities (principal_id,issuer,subject)
VALUES ($1,$2,$3) ON CONFLICT (issuer,subject) DO NOTHING`, p.ID, issuer, subject)
		}
	}
	if err != nil {
		return Principal{}, err
	}

	if _, err = tx.ExecContext(ctx, `UPDATE blog_principals SET
display_name=CASE WHEN $2 != '' THEN $2 ELSE display_name END,
email=CASE WHEN $3 != '' THEN $3 ELSE email END,
avatar_url=CASE WHEN $4 != '' THEN $4 ELSE avatar_url END,
last_seen_at=NOW()
WHERE id=$1`, p.ID, display, email, avatar); err != nil {
		return Principal{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE blog_principal_identities SET last_seen_at=NOW()
WHERE issuer=$1 AND subject=$2`, issuer, subject); err != nil {
		return Principal{}, err
	}
	p.Issuer, p.Subject = issuer, subject
	if display != "" {
		p.DisplayName = display
	}
	if email != "" {
		p.Email = email
	}
	return p, nil
}

// ApproveIdentityAlias atomically records an operator-approved mapping and
// attaches the new issuer/subject to the existing Blog principal. It never
// links identities using email, display name, or matching subject text.
func (s *Service) ApproveIdentityAlias(ctx context.Context, approval IdentityAliasApproval) error {
	for label, value := range map[string]string{
		"legacy issuer":      approval.LegacyIssuer,
		"legacy subject":     approval.LegacySubject,
		"new issuer":         approval.NewIssuer,
		"new subject":        approval.NewSubject,
		"approved by":        approval.ApprovedBy,
		"evidence reference": approval.EvidenceReference,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required", label)
		}
	}
	if approval.LegacyIssuer == approval.NewIssuer && approval.LegacySubject == approval.NewSubject {
		return errors.New("identity alias must differ from the existing identity")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var principalID int64
	err = tx.QueryRowContext(ctx, `SELECT principal_id FROM blog_principal_identities
		WHERE issuer=$1 AND subject=$2 FOR UPDATE`, approval.LegacyIssuer, approval.LegacySubject).Scan(&principalID)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("legacy identity was not found")
	}
	if err != nil {
		return err
	}

	var existingPrincipalID int64
	err = tx.QueryRowContext(ctx, `SELECT principal_id FROM blog_principal_identities
		WHERE issuer=$1 AND subject=$2 FOR UPDATE`, approval.NewIssuer, approval.NewSubject).Scan(&existingPrincipalID)
	if err == nil && existingPrincipalID != principalID {
		return ErrIdentityAliasConflict
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	var approvalID int64
	err = tx.QueryRowContext(ctx, `INSERT INTO blog_principal_identity_alias_approvals
			(principal_id,issuer,subject,approved_by,evidence_reference)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (issuer,subject) DO NOTHING RETURNING id`, principalID, approval.NewIssuer, approval.NewSubject, approval.ApprovedBy, approval.EvidenceReference).Scan(&approvalID)
	if errors.Is(err, sql.ErrNoRows) {
		var approvedPrincipalID int64
		if err = tx.QueryRowContext(ctx, `SELECT principal_id FROM blog_principal_identity_alias_approvals
			WHERE issuer=$1 AND subject=$2 FOR UPDATE`, approval.NewIssuer, approval.NewSubject).Scan(&approvedPrincipalID); err != nil {
			return err
		}
		if approvedPrincipalID != principalID {
			return ErrIdentityAliasConflict
		}
	} else if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_principal_identities (principal_id,issuer,subject)
			VALUES ($1,$2,$3) ON CONFLICT (issuer,subject) DO UPDATE SET last_seen_at=blog_principal_identities.last_seen_at
			RETURNING id`, principalID, approval.NewIssuer, approval.NewSubject); err != nil {
		return err
	}
	var linkedPrincipalID int64
	if err = tx.QueryRowContext(ctx, `SELECT principal_id FROM blog_principal_identities
		WHERE issuer=$1 AND subject=$2 FOR UPDATE`, approval.NewIssuer, approval.NewSubject).Scan(&linkedPrincipalID); err != nil {
		return err
	}
	if linkedPrincipalID != principalID {
		return ErrIdentityAliasConflict
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits
		(target_principal_id,action,result,after_state,reason)
		VALUES ($1,'identity_alias_approved','success',jsonb_build_object('issuer',$2::text,'subject',$3::text),$4)`,
		principalID, approval.NewIssuer, approval.NewSubject, approval.EvidenceReference); err != nil {
		return err
	}
	return tx.Commit()
}

func stringsClaim(value any) []string {
	var out []string
	switch values := value.(type) {
	case []interface{}:
		for _, v := range values {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
	case []string:
		out = append(out, values...)
	}
	return out
}
func stringClaim(values jwt.MapClaims, key string) string {
	value, _ := values[key].(string)
	return value
}
func has(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}

func permissions(roles []string) []string {
	set := map[string]bool{}
	for _, role := range roles {
		switch role {
		case RoleOwner, RoleAdmin:
			for _, p := range []string{PermissionManageMembers, PermissionManageSite, PermissionManageAI, PermissionManageContent, PermissionAuthorContent, PermissionModerate} {
				set[p] = true
			}
		case RoleEditor:
			set[PermissionManageContent] = true
			set[PermissionAuthorContent] = true
		case RoleAuthor:
			set[PermissionAuthorContent] = true
		case RoleModerator:
			set[PermissionModerate] = true
		}
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// Resolve verifies no identity itself: callers pass only already JWT-verified claims.
// It performs JIT identity projection and the one-time, explicitly configured
// local bootstrap. Provider roles and scopes never participate in Blog grants.
func (s *Service) Resolve(ctx context.Context, claims jwt.MapClaims) (Snapshot, error) {
	issuer, subject := stringClaim(claims, "iss"), stringClaim(claims, "sub")
	if issuer == "" || subject == "" {
		return Snapshot{}, fmt.Errorf("missing verified issuer or subject")
	}
	display := stringClaim(claims, "name")
	if display == "" {
		display = stringClaim(claims, "preferred_username")
	}
	if display == "" {
		display = stringClaim(claims, "username")
	}
	email, avatar := stringClaim(claims, "email"), stringClaim(claims, "picture")
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Snapshot{}, err
	}
	defer tx.Rollback()
	var p Principal
	p, err = s.resolvePrincipal(ctx, tx, issuer, subject, display, email, avatar)
	if err != nil {
		return Snapshot{}, err
	}
	isBootstrapOwner := s.bootstrap.Issuer != "" && s.bootstrap.Subject != "" && issuer == s.bootstrap.Issuer && subject == s.bootstrap.Subject
	if isBootstrapOwner {
		var membershipID int64
		if err = tx.QueryRowContext(ctx, `INSERT INTO blog_memberships (principal_id) VALUES ($1) ON CONFLICT (principal_id) DO UPDATE SET status='active', authorization_version=blog_memberships.authorization_version+1, updated_at=NOW() RETURNING id`, p.ID).Scan(&membershipID); err != nil {
			return Snapshot{}, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings (membership_id, role) VALUES ($1,'owner') ON CONFLICT DO NOTHING`, membershipID); err != nil {
			return Snapshot{}, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits (target_principal_id,action,result,after_state) VALUES ($1,'bootstrap_owner','success',jsonb_build_object('roles',jsonb_build_array('owner')))`, p.ID); err != nil {
			return Snapshot{}, err
		}
	}
	var status sql.NullString
	var version sql.NullInt64
	_ = tx.QueryRowContext(ctx, `SELECT status, authorization_version FROM blog_memberships WHERE principal_id=$1`, p.ID).Scan(&status, &version)
	roles := []string{}
	if status.Valid && status.String == "active" {
		rows, queryErr := tx.QueryContext(ctx, `SELECT role FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE m.principal_id=$1 ORDER BY role`, p.ID)
		if queryErr != nil {
			return Snapshot{}, queryErr
		}
		defer rows.Close()
		for rows.Next() {
			var role string
			if err = rows.Scan(&role); err != nil {
				return Snapshot{}, err
			}
			roles = append(roles, role)
		}
		if err = rows.Err(); err != nil {
			return Snapshot{}, err
		}
	}
	if err = tx.Commit(); err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Principal: p, MembershipStatus: status.String, Roles: roles, Permissions: permissions(roles), AuthorizationVersion: version.Int64}, nil
}

func (s *Service) Has(snapshot Snapshot, permission string) bool {
	return snapshot.MembershipStatus == "active" && has(snapshot.Permissions, permission)
}

func (s *Service) ListMembers(ctx context.Context) ([]Member, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.issuer,p.subject,p.display_name,p.email,m.status,m.authorization_version,COALESCE(array_agg(b.role ORDER BY b.role) FILTER (WHERE b.role IS NOT NULL), '{}') FROM blog_principals p LEFT JOIN blog_memberships m ON m.principal_id=p.id LEFT JOIN blog_role_bindings b ON b.membership_id=m.id GROUP BY p.id,m.id ORDER BY p.last_seen_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Member
	for rows.Next() {
		var member Member
		var roles pq.StringArray
		var status sql.NullString
		var version sql.NullInt64
		if err := rows.Scan(&member.Principal.ID, &member.Principal.Issuer, &member.Principal.Subject, &member.Principal.DisplayName, &member.Principal.Email, &status, &version, &roles); err != nil {
			return nil, err
		}
		member.MembershipStatus = status.String
		member.AuthorizationVersion = version.Int64
		member.Roles = []string(roles)
		member.Permissions = permissions(member.Roles)
		result = append(result, member)
	}
	return result, rows.Err()
}

func (s *Service) SetMember(ctx context.Context, actor Snapshot, principalID int64, displayName *string, status string, roles []string, reason, requestID, sourceIP string) error {
	if !s.Has(actor, PermissionManageMembers) {
		return ErrForbidden
	}
	if status != "active" && status != "suspended" && status != "removed" {
		return fmt.Errorf("invalid membership status")
	}
	valid := map[string]bool{RoleOwner: true, RoleAdmin: true, RoleEditor: true, RoleAuthor: true, RoleModerator: true}
	seen := map[string]bool{}
	for _, role := range roles {
		if !valid[role] || seen[role] {
			return fmt.Errorf("invalid role")
		}
		seen[role] = true
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Transaction-level advisory lock to serialize authorization changes
	_, _ = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('blog_authorization_lock'))`)

	if displayName != nil {
		if _, err = tx.ExecContext(ctx, `UPDATE blog_principals SET display_name=$2 WHERE id=$1`, principalID, strings.TrimSpace(*displayName)); err != nil {
			return err
		}
	}

	var previousRoles pq.StringArray
	var previousStatus string
	var membershipID int64
	err = tx.QueryRowContext(ctx, `SELECT m.id,m.status,COALESCE(array_agg(b.role) FILTER (WHERE b.role IS NOT NULL),'{}') FROM blog_memberships m LEFT JOIN blog_role_bindings b ON b.membership_id=m.id WHERE m.principal_id=$1 GROUP BY m.id`, principalID).Scan(&membershipID, &previousStatus, &previousRoles)
	if err == sql.ErrNoRows {
		err = tx.QueryRowContext(ctx, `INSERT INTO blog_memberships(principal_id,status) VALUES($1,$2) RETURNING id`, principalID, status).Scan(&membershipID)
		previousStatus = ""
		previousRoles = pq.StringArray{}
	} else if err != nil {
		return err
	}

	wasOwner := has([]string(previousRoles), RoleOwner)
	willBeOwner := has(roles, RoleOwner)

	// Admin cannot modify any Owner (cannot grant, cannot revoke, cannot suspend/remove/restore an Owner)
	if (wasOwner || willBeOwner) && !has(actor.Roles, RoleOwner) {
		_, _ = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits(actor_principal_id,target_principal_id,action,result,reason,request_id,source_ip) VALUES($1,$2,'membership_update_denied','denied',$3,$4,$5)`, actor.Principal.ID, principalID, "owner role changes require an active owner", requestID, sourceIP)
		_ = tx.Commit()
		return ErrOwnerOnly
	}

	if principalID == actor.Principal.ID && willBeOwner && !has(actor.Roles, RoleOwner) {
		return ErrSelfEscalation
	}

	if _, err = tx.ExecContext(ctx, `UPDATE blog_memberships SET status=$2,authorization_version=authorization_version+1,updated_at=NOW() WHERE id=$1`, membershipID, status); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM blog_role_bindings WHERE membership_id=$1`, membershipID); err != nil {
		return err
	}
	for _, role := range roles {
		if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role) VALUES($1,$2)`, membershipID, role); err != nil {
			return err
		}
	}

	// Verify database-level invariant: At least 1 active owner must remain
	var activeOwners int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(DISTINCT m.principal_id) FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE b.role='owner' AND m.status='active'`).Scan(&activeOwners); err != nil {
		return err
	}
	if activeOwners < 1 {
		return ErrLastOwner
	}

	before, _ := json.Marshal(map[string]any{"status": previousStatus, "roles": previousRoles})
	after, _ := json.Marshal(map[string]any{"status": status, "roles": roles})
	_, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits(actor_principal_id,target_principal_id,action,result,before_state,after_state,request_id,source_ip,reason) VALUES($1,$2,'membership_updated','success',$3,$4,$5,$6,$7)`, actor.Principal.ID, principalID, before, after, requestID, sourceIP, strings.TrimSpace(reason))
	if err != nil {
		return err
	}
	return tx.Commit()
}

// TransferOwner atomically promotes target to Owner and demotes actor from Owner to Admin.
// Existing other Owners are preserved. The caller must have already completed recent MFA.
func (s *Service) TransferOwner(ctx context.Context, actor Snapshot, targetPrincipalID int64, reason, requestID, sourceIP string) error {
	if !has(actor.Roles, RoleOwner) || actor.Principal.ID == targetPrincipalID {
		return ErrOwnerOnly
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Transaction-level advisory lock
	_, _ = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('blog_authorization_lock'))`)

	var targetMembership int64
	var targetRoles pq.StringArray
	if err = tx.QueryRowContext(ctx, `SELECT m.id, COALESCE(array_agg(b.role) FILTER (WHERE b.role IS NOT NULL),'{}') FROM blog_memberships m LEFT JOIN blog_role_bindings b ON b.membership_id=m.id WHERE m.principal_id=$1 AND m.status='active' GROUP BY m.id FOR UPDATE`, targetPrincipalID).Scan(&targetMembership, &targetRoles); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("target must be an active member")
		}
		return err
	}
	var actorMembership int64
	var actorRoles pq.StringArray
	if err = tx.QueryRowContext(ctx, `SELECT m.id, COALESCE(array_agg(b.role) FILTER (WHERE b.role IS NOT NULL),'{}') FROM blog_memberships m LEFT JOIN blog_role_bindings b ON b.membership_id=m.id WHERE m.principal_id=$1 AND m.status='active' GROUP BY m.id FOR UPDATE`, actor.Principal.ID).Scan(&actorMembership, &actorRoles); err != nil {
		return err
	}

	// Demote actor from owner and grant admin
	if _, err = tx.ExecContext(ctx, `DELETE FROM blog_role_bindings WHERE membership_id=$1 AND role='owner'`, actorMembership); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role) VALUES($1,'admin') ON CONFLICT DO NOTHING`, actorMembership); err != nil {
		return err
	}

	// Promote target to owner
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role) VALUES($1,'owner') ON CONFLICT DO NOTHING`, targetMembership); err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `UPDATE blog_memberships SET authorization_version=authorization_version+1,updated_at=NOW() WHERE id IN ($1,$2)`, actorMembership, targetMembership); err != nil {
		return err
	}

	// Verify database-level invariant
	var activeOwners int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(DISTINCT m.principal_id) FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE b.role='owner' AND m.status='active'`).Scan(&activeOwners); err != nil {
		return err
	}
	if activeOwners < 1 {
		return ErrLastOwner
	}

	beforeState, _ := json.Marshal(map[string]any{
		"actor":  map[string]any{"principal_id": actor.Principal.ID, "roles": actorRoles},
		"target": map[string]any{"principal_id": targetPrincipalID, "roles": targetRoles},
	})
	afterState, _ := json.Marshal(map[string]any{
		"actor":  map[string]any{"principal_id": actor.Principal.ID, "roles": []string{"admin"}},
		"target": map[string]any{"principal_id": targetPrincipalID, "roles": []string{"owner"}},
	})

	_, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits(actor_principal_id,target_principal_id,action,result,before_state,after_state,request_id,source_ip,reason) VALUES($1,$2,'owner_transferred','success',$3,$4,$5,$6,$7)`, actor.Principal.ID, targetPrincipalID, beforeState, afterState, requestID, sourceIP, strings.TrimSpace(reason))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ListAudits(ctx context.Context, limit int) ([]Audit, error) {
	if limit < 1 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT a.id,a.action,COALESCE(a.result,'success'),a.before_state,a.after_state,COALESCE(a.request_id,''),COALESCE(a.session_id,''),COALESCE(a.source_ip,''),COALESCE(a.reason,''),a.created_at,ap.id,ap.issuer,ap.subject,ap.display_name,ap.email,tp.id,tp.issuer,tp.subject,tp.display_name,tp.email FROM blog_authorization_audits a LEFT JOIN blog_principals ap ON ap.id=a.actor_principal_id LEFT JOIN blog_principals tp ON tp.id=a.target_principal_id ORDER BY a.created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Audit
	for rows.Next() {
		var a Audit
		var actor, target Principal
		var aid, tid sql.NullInt64
		var ai, as, ad, ae, ti, ts, td, te sql.NullString
		if err = rows.Scan(&a.ID, &a.Action, &a.Result, &a.Before, &a.After, &a.RequestID, &a.SessionID, &a.SourceIP, &a.Reason, &a.CreatedAt, &aid, &ai, &as, &ad, &ae, &tid, &ti, &ts, &td, &te); err != nil {
			return nil, err
		}
		if aid.Valid {
			actor = Principal{ID: aid.Int64, Issuer: ai.String, Subject: as.String, DisplayName: ad.String, Email: ae.String}
			a.Actor = &actor
		}
		if tid.Valid {
			target = Principal{ID: tid.Int64, Issuer: ti.String, Subject: ts.String, DisplayName: td.String, Email: te.String}
			a.Target = &target
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func RecentMFA(claims jwt.MapClaims, now time.Time) bool {
	if claims == nil {
		return false
	}
	var authTimeUnix int64
	switch v := claims["auth_time"].(type) {
	case float64:
		if v <= 0 {
			return false
		}
		authTimeUnix = int64(v)
	case json.Number:
		n, err := v.Int64()
		if err != nil || n <= 0 {
			return false
		}
		authTimeUnix = n
	case int64:
		if v <= 0 {
			return false
		}
		authTimeUnix = v
	case int:
		if v <= 0 {
			return false
		}
		authTimeUnix = int64(v)
	default:
		return false
	}

	authTime := time.Unix(authTimeUnix, 0)
	// Reject future timestamps exceeding allowed clock skew (60s)
	if authTime.After(now.Add(60 * time.Second)) {
		return false
	}
	// Reject auth older than 10 minutes
	if now.Sub(authTime) > 10*time.Minute {
		return false
	}

	for _, v := range stringsClaim(claims["amr"]) {
		switch strings.ToLower(v) {
		case "otp", "totp", "mfa", "swk", "webauthn", "fido2":
			return true
		}
	}
	return false
}

// RecoverOwner is deliberately available only to local operations tooling. It
// never has an HTTP route and refuses to run while any Owner binding exists.
func (s *Service) RecoverOwner(ctx context.Context, issuer, subject, reason string) error {
	issuer, subject, reason = strings.TrimSpace(issuer), strings.TrimSpace(subject), strings.TrimSpace(reason)
	if issuer == "" || subject == "" || reason == "" {
		return fmt.Errorf("issuer, subject, and recovery reason are required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Transaction-level advisory lock
	_, _ = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('blog_authorization_lock'))`)

	var ownerExists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE b.role='owner' AND m.status='active')`).Scan(&ownerExists); err != nil {
		return err
	}
	if ownerExists {
		return fmt.Errorf("an owner already exists")
	}
	var principalID, membershipID int64
	if err = tx.QueryRowContext(ctx, `INSERT INTO blog_principals (issuer,subject) VALUES ($1,$2) ON CONFLICT (issuer,subject) DO UPDATE SET last_seen_at=NOW() RETURNING id`, issuer, subject).Scan(&principalID); err != nil {
		return err
	}
	if err = tx.QueryRowContext(ctx, `INSERT INTO blog_memberships (principal_id,status) VALUES ($1,'active') ON CONFLICT (principal_id) DO UPDATE SET status='active',authorization_version=blog_memberships.authorization_version+1,updated_at=NOW() RETURNING id`, principalID).Scan(&membershipID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings (membership_id,role) VALUES ($1,'owner') ON CONFLICT DO NOTHING`, membershipID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits (target_principal_id,action,result,after_state,reason) VALUES ($1,'owner_recovered','success',jsonb_build_object('roles',jsonb_build_array('owner')),$2)`, principalID, reason); err != nil {
		return err
	}
	return tx.Commit()
}

type IntegrityReport struct {
	PrincipalCount      int64 `json:"principal_count"`
	IdentityCount       int64 `json:"identity_count"`
	MembershipCount     int64 `json:"membership_count"`
	RoleBindingCount    int64 `json:"role_binding_count"`
	ActiveOwnerCount    int64 `json:"active_owner_count"`
	ConflictingSubjects int64 `json:"conflicting_subjects"`
}

// VerifyIntegrity runs a read-only integrity audit across Blog principals, identities, and roles.
func (s *Service) VerifyIntegrity(ctx context.Context) (IntegrityReport, error) {
	var r IntegrityReport
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_principals`).Scan(&r.PrincipalCount); err != nil {
		return r, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_principal_identities`).Scan(&r.IdentityCount); err != nil {
		return r, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_memberships`).Scan(&r.MembershipCount); err != nil {
		return r, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_role_bindings`).Scan(&r.RoleBindingCount); err != nil {
		return r, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE b.role='owner' AND m.status='active'`).Scan(&r.ActiveOwnerCount); err != nil {
		return r, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM (
		SELECT subject FROM blog_principal_identities GROUP BY subject HAVING COUNT(DISTINCT principal_id) > 1
	) conflicts`).Scan(&r.ConflictingSubjects); err != nil {
		return r, err
	}
	return r, nil
}

func ClaimSnapshot(ctx context.Context) (Snapshot, bool) {
	value := ctx.Value(snapshotKey{})
	snapshot, ok := value.(Snapshot)
	return snapshot, ok
}

type snapshotKey struct{}

func WithSnapshot(ctx context.Context, s Snapshot) context.Context {
	return context.WithValue(ctx, snapshotKey{}, s)
}
func ClaimSummary(claims jwt.MapClaims) string {
	return strings.Join(stringsClaim(claims["roles"]), ",")
}
