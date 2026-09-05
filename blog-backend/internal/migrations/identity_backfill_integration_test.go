package migrations

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/identitybackfill"
	"github.com/rushairer/blog-backend/internal/repository"
)

func isolatedIdentityDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	u, err := url.Parse(dsn)
	if err != nil || u == nil || u.Hostname() != "127.0.0.1" || u.User == nil || u.User.Username() != "blog_ci" || !strings.HasPrefix(u.Path, "/blog_ci_") {
		t.Fatal("requires the disposable integration runner")
	}
	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("blog_ci_identity_%d", time.Now().UnixNano())
	if _, err = admin.Exec(`CREATE DATABASE ` + pq.QuoteIdentifier(name)); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	u.Path = "/" + name
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		if _, err := admin.Exec(`DROP DATABASE ` + pq.QuoteIdentifier(name) + ` WITH (FORCE)`); err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	return db
}

func historicalSQL(t *testing.T, until string, original bool) fs.FS {
	t.Helper()
	files := fstest.MapFS{}
	names, err := fs.Glob(migrationFiles, "sql/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		if name > "sql/"+until {
			continue
		}
		if original && (strings.Contains(name, "085z_") || strings.Contains(name, "090_")) {
			continue
		}
		body, err := migrationFiles.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if original && (strings.Contains(name, "086_") || strings.Contains(name, "088_") || strings.Contains(name, "089_")) {
			body, err = os.ReadFile("testdata/legacy/" + strings.TrimPrefix(name, "sql/"))
			if err != nil {
				t.Fatal(err)
			}
		}
		files[name] = &fstest.MapFile{Data: body}
	}
	return files
}

func through(t *testing.T, db *sql.DB, until string, original bool) {
	t.Helper()
	if err := up(context.Background(), db, historicalSQL(t, until, original)); err != nil {
		t.Fatal(err)
	}
}
func execIdentity(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatal(err)
	}
}
func countIdentity(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func identityActor(t *testing.T, db *sql.DB, issuer, subject string, owner bool) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRow(`INSERT INTO blog_principals(issuer,subject) VALUES($1,$2) RETURNING id`, issuer, subject).Scan(&id); err != nil {
		t.Fatal(err)
	}
	execIdentity(t, db, `INSERT INTO blog_principal_identities(principal_id,issuer,subject) VALUES($1,$2,$3)`, id, issuer, subject)
	if owner {
		execIdentity(t, db, `WITH m AS (INSERT INTO blog_memberships(principal_id) VALUES($1) RETURNING id) INSERT INTO blog_role_bindings(membership_id,role) SELECT id,'owner' FROM m`, id)
	}
	return id
}
func identityComment(t *testing.T, db *sql.DB, subject string) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRow(`WITH p AS (INSERT INTO posts(title,slug,content) VALUES('fixture',$1,'body') RETURNING id)
	INSERT INTO comments(post_id,author,content,author_type,author_subject) SELECT id,'fixture','body','user',$2 FROM p RETURNING id`, fmt.Sprintf("identity-%d", time.Now().UnixNano()), subject).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
func mapping(id int64, subject, issuer string) identitybackfill.Mapping {
	raw, _ := json.Marshal(subject)
	return identitybackfill.Mapping{SourceTable: "comments", RowID: id, SourceColumn: "author_subject", OriginalValue: raw, Issuer: issuer, Subject: subject, EvidenceReference: "fixture-evidence"}
}

func TestIdentityFreshInstallAndSystemBootstrap(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if n := countIdentity(t, db, `SELECT count(*) FROM blog_principals`); n != 0 {
		t.Fatalf("migration created %d principals", n)
	}
	if n := countIdentity(t, db, `SELECT count(*) FROM blog_memberships`); n != 0 {
		t.Fatal("migration created memberships")
	}
	for _, table := range []string{"ai_agents", "ai_skills", "ai_skill_versions", "ai_workflows", "ai_workflow_versions"} {
		if n := countIdentity(t, db, `SELECT count(*) FROM `+table+` WHERE creation_origin<>'system' OR created_by_principal_id IS NOT NULL`); n != 0 {
			t.Fatalf("%s false human attribution", table)
		}
	}
	execIdentity(t, db, `INSERT INTO ai_provider_profiles(name,provider_type,base_url,model,api_key_ciphertext,api_key_nonce,api_key_last4,key_version,enabled,is_default_writing,request_timeout_seconds,max_output_tokens)
	VALUES('fixture','openai','https://fixture.test','fixture','\x01','\x02','test',1,true,true,60,1024)`)
	// Even an ordinary existing user must not become the template creator.
	identityActor(t, db, "https://fixture.test", "ordinary", false)
	repo := repository.NewAgentRepository(db)
	if _, err := repo.BootstrapStarterPack(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.BootstrapStarterPack(ctx); err != nil {
		t.Fatal(err)
	}
	agents, err := repo.ListAgents(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range agents {
		if a.CreationOrigin != "system" || a.CreatedByPrincipalID != nil || a.Enabled {
			t.Fatalf("unexpected system agent: %d", a.ID)
		}
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_role_bindings`) > 0 {
		t.Fatal("bootstrap granted a role")
	}
}

func TestIdentityApprovalUpgradeRollbackAndExactIssuer(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	through(t, db, "085z_identity_backfill_preparation.sql", false)
	identityActor(t, db, "https://first.test", "same", true)
	exact := identityActor(t, db, "https://second.test", "same", false)
	id := identityComment(t, db, "same")
	execIdentity(t, db, `INSERT INTO blog_authorization_audits(actor_principal_id,action,before_state,after_state,reason) VALUES($1,'fixture-audit','{"kept":1}','{"kept":2}','preserve')`, exact)

	if err := Up(ctx, db); err == nil || !strings.Contains(err.Error(), "comments") {
		t.Fatalf("missing approval should fail: %v", err)
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_schema_migrations WHERE version LIKE 'sql/086_%'`) != 0 {
		t.Fatal("failed migration recorded")
	}
	if countIdentity(t, db, `SELECT count(*) FROM information_schema.columns WHERE table_name='comments' AND column_name='author_principal_id'`) != 0 {
		t.Fatal("failed migration did not roll back DDL")
	}
	items, err := identitybackfill.Report(ctx, db)
	if err != nil || len(items) != 1 {
		t.Fatalf("report=%v err=%v", items, err)
	}
	m := mapping(id, "same", "https://second.test")
	if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{m}, "operator", "verified"); err != nil {
		t.Fatal(err)
	}
	if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{m}, "operator", "verified"); err != nil {
		t.Fatal("identical approval should be idempotent", err)
	}
	bad := m
	bad.Issuer = "https://first.test"
	if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{bad}, "operator", "verified"); err == nil {
		t.Fatal("conflict accepted")
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if got := countIdentity(t, db, `SELECT author_principal_id FROM comments WHERE id=$1`, id); int64(got) != exact {
		t.Fatalf("wrong issuer mapped: %d", got)
	}
	if countIdentity(t, db, `SELECT count(*) FROM comments WHERE id=$1 AND content='body' AND author='fixture'`, id) != 1 {
		t.Fatal("comment content changed")
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_authorization_audits WHERE actor_principal_id=$1 AND action='fixture-audit' AND before_state='{"kept":1}' AND after_state='{"kept":2}' AND reason='preserve'`, exact) != 1 {
		t.Fatal("audit changed")
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_identity_legacy_evidence WHERE source_table='comments' AND row_id=$1 AND original_value='"same"'`, id) != 1 {
		t.Fatal("source evidence lost")
	}

	if countIdentity(t, db, `SELECT count(*) FROM blog_role_bindings WHERE role='owner'`) != 1 {
		t.Fatal("roles changed")
	}
}

func TestIdentityApprovalRejectsStaleUnknownAndAtomicBatch(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	through(t, db, "085z_identity_backfill_preparation.sql", false)
	identityActor(t, db, "https://fixture.test", "user", false)
	id := identityComment(t, db, "user")
	m := mapping(id, "user", "https://fixture.test")
	for _, kind := range []string{"table", "missing-identity", "stale", "unknown-row"} {
		bad := m
		switch kind {
		case "table":
			bad.SourceTable = "blog_principals"
		case "missing-identity":
			bad.Issuer = "https://missing.test"
		case "stale":
			bad.OriginalValue = json.RawMessage(`"changed"`)
		case "unknown-row":
			bad.RowID = 999999
		}
		if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{m, bad}, "operator", "verified"); err == nil {
			t.Fatalf("accepted %s", kind)
		}
		if countIdentity(t, db, `SELECT count(*) FROM blog_identity_backfill_approvals`) != 0 {
			t.Fatal("batch partially committed")
		}
	}
	if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{m}, "operator", "verified"); err != nil {
		t.Fatal(err)
	}
	execIdentity(t, db, `UPDATE comments SET author_subject='changed' WHERE id=$1`, id)
	if err := Up(ctx, db); err == nil {
		t.Fatal("migration accepted stale approval")
	}
	m.OriginalValue = json.RawMessage(`"changed"`)
	if err := identitybackfill.Approve(ctx, db, []identitybackfill.Mapping{m}, "operator", "new evidence"); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_identity_backfill_approvals`) != 2 {
		t.Fatal("approval history lost")
	}

}

func TestIdentityAlteredSeedFailsClosed(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	through(t, db, "085_connector_oauth_pkce.sql", false)
	execIdentity(t, db, `UPDATE ai_skills SET system_prompt=system_prompt||' changed' WHERE id=(SELECT MIN(id) FROM ai_skills)`)
	if err := Up(ctx, db); err == nil || !strings.Contains(err.Error(), "ai_skills") {
		t.Fatalf("altered seed must require identity evidence: %v", err)
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_schema_migrations WHERE version LIKE 'sql/088_%'`) != 0 {
		t.Fatal("failed backfill recorded")
	}
}

func TestIdentityAlreadyAppliedCutoverPreservesAttribution(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	through(t, db, "085_connector_oauth_pkce.sql", true)
	owner := identityActor(t, db, "https://fixture.test", "real-owner", true)
	id := identityComment(t, db, "unmapped-historical-user")
	through(t, db, "089_drop_legacy_identity_columns.sql", true)
	var applied time.Time
	if err := db.QueryRow(`SELECT applied_at FROM blog_schema_migrations WHERE version='sql/086_community_principal_identity.sql'`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if int64(countIdentity(t, db, `SELECT author_principal_id FROM comments WHERE id=$1`, id)) != owner {
		t.Fatal("old attribution silently changed")
	}
	if countIdentity(t, db, `SELECT count(*) FROM ai_skills WHERE creation_origin='legacy' AND created_by_principal_id=$1`, owner) != 15 {
		t.Fatal("historical seed reattributed")
	}
	var after time.Time
	_ = db.QueryRow(`SELECT applied_at FROM blog_schema_migrations WHERE version='sql/086_community_principal_identity.sql'`).Scan(&after)
	if !after.Equal(applied) {
		t.Fatal("old migration rerun")
	}
	items, err := identitybackfill.Report(ctx, db)
	if err != nil || len(items) == 0 {
		t.Fatalf("legacy evidence not reported: %v", err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
}

func TestIdentityOriginConstraintsAndHumanVersions(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	actor := identityActor(t, db, "https://fixture.test", "editor", false)
	if _, err := db.Exec(`INSERT INTO ai_workflows(name) VALUES('missing actor')`); err == nil {
		t.Fatal("human without actor accepted")
	}
	if _, err := db.Exec(`INSERT INTO ai_workflows(name,creation_origin,created_by_principal_id) VALUES('fake system','system',$1)`, actor); err == nil {
		t.Fatal("system with human identity accepted")
	}
	repo := repository.NewAgentRepository(db)
	skills, err := repo.ListSkills(ctx)
	if err != nil {
		t.Fatal(err)
	}
	skill := skills[0]
	skill.CreatedByPrincipalID = &actor
	skill.SystemPrompt += " updated by editor"
	if err := repo.UpdateSkill(ctx, skill); err != nil {
		t.Fatal(err)
	}
	current, err := repo.GetSkill(ctx, skill.ID)
	if err != nil || current.CreationOrigin != "system" || current.CreatedByPrincipalID != nil {
		t.Fatalf("creator changed: %v", err)
	}
	version, err := repo.GetSkillVersion(ctx, skill.VersionID)
	if err != nil || version.CreationOrigin != "human" || version.CreatedByPrincipalID == nil || *version.CreatedByPrincipalID != actor {
		t.Fatalf("version not attributed: %v", err)
	}
}

func TestIdentityPartialUpgradeAndNonHumanSemantics(t *testing.T) {
	for _, stage := range []string{"086_community_principal_identity.sql", "088_backfill_ai_principal_identity.sql"} {
		t.Run(stage, func(t *testing.T) {
			db := isolatedIdentityDB(t)
			ctx := context.Background()
			through(t, db, "085_connector_oauth_pkce.sql", true)
			owner := identityActor(t, db, "https://fixture.test", "owner", true)
			guest := identityComment(t, db, "")
			execIdentity(t, db, `UPDATE comments SET author_type='guest',author_subject=NULL WHERE id=$1`, guest)
			through(t, db, stage, true)
			execIdentity(t, db, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,schedule_key) SELECT workflow_id,id,'scheduled-fixture' FROM ai_workflow_versions ORDER BY id LIMIT 1`)
			execIdentity(t, db, `WITH r AS (INSERT INTO ai_agent_runs(agent_id,skill_version_id,trigger_type,schedule_key,provider,model)
    SELECT a.id,v.id,'cron','scheduled-fixture','openai','fixture' FROM ai_agents a CROSS JOIN ai_skill_versions v ORDER BY a.id,v.id LIMIT 1 RETURNING id),
    c AS (INSERT INTO ai_tool_calls(run_id,tool_name,risk_level) SELECT id,'fixture','propose' FROM r RETURNING id,run_id)
    INSERT INTO ai_approvals(run_id,tool_call_id,action_type,target_type,proposed_payload) SELECT run_id,id,'fixture','post','{}' FROM c`)
			if err := Up(ctx, db); err != nil {
				t.Fatal(err)
			}
			if countIdentity(t, db, `SELECT count(*) FROM comments WHERE id=$1 AND author_principal_id IS NULL`, guest) != 1 {
				t.Fatal("guest attributed")
			}
			if countIdentity(t, db, `SELECT count(*) FROM ai_workflow_runs WHERE triggered_by_principal_id IS NULL AND trigger_kind='scheduler'`) != 1 {
				t.Fatal("scheduler attributed")
			}
			if countIdentity(t, db, `SELECT count(*) FROM ai_agent_runs WHERE triggered_by_principal_id IS NULL`) != 1 {
				t.Fatal("cron attributed")
			}
			if countIdentity(t, db, `SELECT count(*) FROM ai_approvals WHERE reviewed_by_principal_id IS NULL AND status='pending'`) != 1 {
				t.Fatal("pending reviewer fabricated")
			}
			if countIdentity(t, db, `SELECT count(*) FROM blog_role_bindings WHERE role='owner'`) != 1 {
				t.Fatal("owner changed")
			}
			if stage == "088_backfill_ai_principal_identity.sql" && countIdentity(t, db, `SELECT count(*) FROM ai_skills WHERE created_by_principal_id=$1 AND creation_origin='legacy'`, owner) != 15 {
				t.Fatal("existing creator lost")
			}
		})
	}
}

func TestIdentityBeforeDropRevalidatesHumanRecords(t *testing.T) {
	db := isolatedIdentityDB(t)
	ctx := context.Background()
	through(t, db, "088_backfill_ai_principal_identity.sql", false)
	execIdentity(t, db, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,triggered_by) SELECT workflow_id,id,'unproved-human' FROM ai_workflow_versions ORDER BY id LIMIT 1`)
	if err := Up(ctx, db); err == nil || !strings.Contains(err.Error(), "ai_workflow_runs") {
		t.Fatalf("cutover accepted unresolved human: %v", err)
	}
	if countIdentity(t, db, `SELECT count(*) FROM blog_schema_migrations WHERE version LIKE 'sql/089_%'`) != 0 {
		t.Fatal("failed cutover ledger written")
	}
	if countIdentity(t, db, `SELECT count(*) FROM information_schema.columns WHERE table_name='ai_workflow_runs' AND column_name='triggered_by'`) != 1 {
		t.Fatal("source lost")
	}
}
