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

type Bootstrap struct{ Issuer, Subject string }

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

type Member struct{ Snapshot }

type Audit struct {
	ID        int64           `json:"id"`
	Action    string          `json:"action"`
	Actor     *Principal      `json:"actor,omitempty"`
	Target    *Principal      `json:"target,omitempty"`
	Before    json.RawMessage `json:"before"`
	After     json.RawMessage `json:"after"`
	CreatedAt time.Time       `json:"created_at"`
}

type Service struct {
	db        *sql.DB
	bootstrap Bootstrap
}

func NewService(db *sql.DB, bootstrap Bootstrap) *Service {
	return &Service{db: db, bootstrap: bootstrap}
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
// It performs JIT identity projection and the one-time, explicitly configured bootstrap.
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
	err = tx.QueryRowContext(ctx, `INSERT INTO blog_principals (issuer, subject, display_name, email, avatar_url)
VALUES ($1,$2,$3,$4,$5) ON CONFLICT (issuer,subject) DO UPDATE SET
  display_name=CASE WHEN EXCLUDED.display_name != '' THEN EXCLUDED.display_name ELSE blog_principals.display_name END,
  email=CASE WHEN EXCLUDED.email != '' THEN EXCLUDED.email ELSE blog_principals.email END,
  avatar_url=CASE WHEN EXCLUDED.avatar_url != '' THEN EXCLUDED.avatar_url ELSE blog_principals.avatar_url END,
  last_seen_at=NOW()
RETURNING id, issuer, subject, display_name, email`, issuer, subject, display, email, avatar).Scan(&p.ID, &p.Issuer, &p.Subject, &p.DisplayName, &p.Email)
	if err != nil {
		return Snapshot{}, err
	}
	var ownerExists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM blog_role_bindings WHERE role='owner')`).Scan(&ownerExists); err != nil {
		return Snapshot{}, err
	}
	if !ownerExists && issuer == s.bootstrap.Issuer && subject == s.bootstrap.Subject && has(stringsClaim(claims["roles"]), "admin") {
		var membershipID int64
		if err = tx.QueryRowContext(ctx, `INSERT INTO blog_memberships (principal_id) VALUES ($1) ON CONFLICT (principal_id) DO UPDATE SET status='active', authorization_version=blog_memberships.authorization_version+1, updated_at=NOW() RETURNING id`, p.ID).Scan(&membershipID); err != nil {
			return Snapshot{}, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings (membership_id, role) VALUES ($1,'owner') ON CONFLICT DO NOTHING`, membershipID); err != nil {
			return Snapshot{}, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits (target_principal_id,action,after_state) VALUES ($1,'bootstrap_owner',jsonb_build_object('roles',jsonb_build_array('owner')))`, p.ID); err != nil {
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
	if has(roles, RoleOwner) && !has(actor.Roles, RoleOwner) {
		return ErrOwnerOnly
	}
	if principalID == actor.Principal.ID && has(roles, RoleOwner) && !has(actor.Roles, RoleOwner) {
		return ErrSelfEscalation
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

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
	if has([]string(previousRoles), RoleOwner) && (!has(roles, RoleOwner) || status != "active") {
		var owners int
		if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_role_bindings b JOIN blog_memberships m ON m.id=b.membership_id WHERE b.role='owner' AND m.status='active'`).Scan(&owners); err != nil {
			return err
		}
		if owners <= 1 {
			return ErrLastOwner
		}
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
	before, _ := json.Marshal(map[string]any{"status": previousStatus, "roles": previousRoles})
	after, _ := json.Marshal(map[string]any{"status": status, "roles": roles})
	_, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits(actor_principal_id,target_principal_id,action,before_state,after_state,request_id,source_ip,reason) VALUES($1,$2,'membership_updated',$3,$4,$5,$6,$7)`, actor.Principal.ID, principalID, before, after, requestID, sourceIP, strings.TrimSpace(reason))
	if err != nil {
		return err
	}
	return tx.Commit()
}

// TransferOwner atomically makes target the sole Owner and leaves the former
// owner as an Admin. The caller must have already completed a recent MFA check.
func (s *Service) TransferOwner(ctx context.Context, actor Snapshot, targetPrincipalID int64, reason, requestID, sourceIP string) error {
	if !has(actor.Roles, RoleOwner) || actor.Principal.ID == targetPrincipalID {
		return ErrOwnerOnly
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var targetMembership int64
	if err = tx.QueryRowContext(ctx, `SELECT id FROM blog_memberships WHERE principal_id=$1 AND status='active' FOR UPDATE`, targetPrincipalID).Scan(&targetMembership); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("target must be an active member")
		}
		return err
	}
	var actorMembership int64
	if err = tx.QueryRowContext(ctx, `SELECT id FROM blog_memberships WHERE principal_id=$1 AND status='active' FOR UPDATE`, actor.Principal.ID).Scan(&actorMembership); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM blog_role_bindings WHERE role='owner'`); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role) VALUES($1,'owner')`, targetMembership); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role) VALUES($1,'admin') ON CONFLICT DO NOTHING`, actorMembership); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE blog_memberships SET authorization_version=authorization_version+1,updated_at=NOW() WHERE id IN ($1,$2)`, actorMembership, targetMembership); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits(actor_principal_id,target_principal_id,action,before_state,after_state,request_id,source_ip,reason) VALUES($1,$2,'owner_transferred',jsonb_build_object('owner_principal_id',$1),jsonb_build_object('owner_principal_id',$2),$3,$4,$5)`, actor.Principal.ID, targetPrincipalID, requestID, sourceIP, strings.TrimSpace(reason))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ListAudits(ctx context.Context, limit int) ([]Audit, error) {
	if limit < 1 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT a.id,a.action,a.before_state,a.after_state,a.created_at,ap.id,ap.issuer,ap.subject,ap.display_name,ap.email,tp.id,tp.issuer,tp.subject,tp.display_name,tp.email FROM blog_authorization_audits a LEFT JOIN blog_principals ap ON ap.id=a.actor_principal_id LEFT JOIN blog_principals tp ON tp.id=a.target_principal_id ORDER BY a.created_at DESC LIMIT $1`, limit)
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
		if err = rows.Scan(&a.ID, &a.Action, &a.Before, &a.After, &a.CreatedAt, &aid, &ai, &as, &ad, &ae, &tid, &ti, &ts, &td, &te); err != nil {
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
	raw, ok := claims["auth_time"].(float64)
	if !ok {
		return false
	}
	if now.Sub(time.Unix(int64(raw), 0)) > 10*time.Minute {
		return false
	}
	for _, v := range stringsClaim(claims["amr"]) {
		if v == "otp" || v == "mfa" || v == "swk" || v == "totp" {
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
	var ownerExists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM blog_role_bindings WHERE role='owner')`).Scan(&ownerExists); err != nil {
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
	if _, err = tx.ExecContext(ctx, `INSERT INTO blog_authorization_audits (target_principal_id,action,after_state,reason) VALUES ($1,'owner_recovered',jsonb_build_object('roles',jsonb_build_array('owner')),$2)`, principalID, reason); err != nil {
		return err
	}
	return tx.Commit()
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
