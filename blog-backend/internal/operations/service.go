package operations

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/internal/tool"
	"go.uber.org/zap"
)

type Service struct {
	db     *sql.DB
	tools  *tool.Registry
	logger *zap.Logger
	wg     sync.WaitGroup
	repo   *repository.AgentRepository
	posts  *service.PostService
}

func (s *Service) ConfigureGovernance(repo *repository.AgentRepository, posts *service.PostService) {
	s.repo, s.posts = repo, posts
}

func NewService(db *sql.DB, tools *tool.Registry, logger *zap.Logger) *Service {
	return &Service{db: db, tools: tools, logger: logger}
}

func schema(properties string) json.RawMessage {
	return json.RawMessage(`{"type":"object","additionalProperties":false,"properties":` + properties + `}`)
}

func (s *Service) RegisterTools() error {
	return s.tools.Register(
		tool.Definition{
			Name: "content.list_broken_links", Description: "List cached broken-link evidence for published posts.",
			Parameters: schema(`{"max_age_hours":{"type":"integer","minimum":1,"maximum":720},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &tool.ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"post_id", "id"}}, Execute: s.listBrokenLinks,
		},
		tool.Definition{
			Name: "content.propose_candidates", Description: "Propose title, summary, or cover-alt candidates for human selection.",
			Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"required":["post_id","field_type","candidates"],"properties":{"post_id":{"type":"integer","minimum":1},"field_type":{"type":"string","enum":["title","summary","cover_alt"]},"candidates":{"type":"array","minItems":2,"maxItems":5,"items":{"type":"object","additionalProperties":false,"required":["value"],"properties":{"value":{"type":"string"},"rationale":{"type":"string"}}}}}}`),
			Risk:       domain.ToolRiskPropose, Scope: &tool.ScopeRule{ResourceType: "post", Argument: "post_id"}, Propose: s.proposeCandidates,
		},
		tool.Definition{
			Name: "content.list_tag_bloat", Description: "Identify low-use and case-colliding tags from aggregate post metadata.",
			Parameters: schema(`{"low_usage_threshold":{"type":"integer","minimum":1,"maximum":20},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &tool.ScopeRule{Discovery: true, OutputResourceType: "tag", OutputKeys: []string{"tag", "name"}}, Execute: s.listTagBloat,
		},
		tool.Definition{
			Name: "operations.propose_suggestion", Description: "Propose an evidence-backed internal operations suggestion.",
			Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"required":["source_type","source_key","title","description","priority","evidence"],"properties":{"source_type":{"type":"string"},"source_key":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string","enum":["low","medium","high"]},"evidence":{"type":"object"},"window_start":{"type":"string"},"window_end":{"type":"string"}}}`),
			Risk:       domain.ToolRiskPropose, Propose: s.proposeSuggestion,
		},
		tool.Definition{Name: "media.get_asset", Description: "Read metadata for one media asset without returning file bytes.", Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"integer","minimum":1}}}`), Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{ResourceType: "media_asset", Argument: "id"}, Execute: s.getMediaAsset},
		tool.Definition{Name: "operations.get_suggestion", Description: "Read one internal operational suggestion and its evidence.", Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"integer","minimum":1}}}`), Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{ResourceType: "operational_suggestion", Argument: "id"}, Execute: s.getSuggestion},
		tool.Definition{Name: "comments.get_comment", Description: "Read one comment with private identity fields removed.", Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"integer","minimum":1}}}`), Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{ResourceType: "comment", Argument: "id"}, Execute: s.getComment},
		tool.Definition{Name: "content.list_categories", Description: "List blog categories and aggregate post counts.", Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{Discovery: true, OutputResourceType: "category", OutputKeys: []string{"id"}}, Execute: s.listCategories},
	)
}

func (s *Service) getMediaAsset(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decode(raw, &args); err != nil || args.ID <= 0 {
		return nil, tool.ErrInvalidArgument
	}
	var item domain.MediaAsset
	err := s.db.QueryRowContext(ctx, `SELECT id,filename,storage_name,url,content_type,size_bytes,alt_text,created_by,created_at FROM media_assets WHERE id=$1`, args.ID).Scan(&item.ID, &item.Filename, &item.StorageName, &item.URL, &item.ContentType, &item.SizeBytes, &item.AltText, &item.CreatedBy, &item.CreatedAt)
	if err != nil {
		return nil, err
	}
	item.StorageName = ""
	return &item, nil
}

func (s *Service) getSuggestion(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decode(raw, &args); err != nil || args.ID <= 0 {
		return nil, tool.ErrInvalidArgument
	}
	items, err := s.ListSuggestions(ctx, "all", 200)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.ID == args.ID {
			return item, nil
		}
	}
	return nil, sql.ErrNoRows
}

func (s *Service) getComment(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decode(raw, &args); err != nil || args.ID <= 0 {
		return nil, tool.ErrInvalidArgument
	}
	var id, postID, reportCount int64
	var parentID *int64
	var content, status string
	var visible bool
	var createdAt time.Time
	err := s.db.QueryRowContext(ctx, `SELECT c.id,c.post_id,c.parent_id,c.content,c.status,c.is_visible,(SELECT COUNT(*) FROM comment_reports cr WHERE cr.comment_id=c.id),c.created_at FROM comments c WHERE c.id=$1`, args.ID).Scan(&id, &postID, &parentID, &content, &status, &visible, &reportCount, &createdAt)
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "post_id": postID, "parent_id": parentID, "content": content, "status": status, "is_visible": visible, "report_count": reportCount, "created_at": createdAt}, nil
}

func (s *Service) listCategories(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct{}
	if err := decode(raw, &args); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT c.id,c.name,c.slug,c.description,c.sort_order,COUNT(p.id) FROM categories c LEFT JOIN posts p ON p.category_id=c.id GROUP BY c.id ORDER BY c.sort_order,c.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, count int64
		var name, slug, description string
		var order int
		if err := rows.Scan(&id, &name, &slug, &description, &order, &count); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"id": id, "name": name, "slug": slug, "description": description, "sort_order": order, "post_count": count})
	}
	return items, rows.Err()
}

func (s *Service) proposeCandidates(ctx context.Context, raw json.RawMessage) (*tool.Proposal, error) {
	if s.posts == nil {
		return nil, errors.New("candidate governance is not configured")
	}
	var args struct {
		PostID     int64                     `json:"post_id"`
		FieldType  string                    `json:"field_type"`
		Candidates []domain.ContentCandidate `json:"candidates"`
	}
	if err := decode(raw, &args); err != nil {
		return nil, err
	}
	if args.PostID <= 0 || (args.FieldType != "title" && args.FieldType != "summary" && args.FieldType != "cover_alt") || len(args.Candidates) < 2 || len(args.Candidates) > 5 {
		return nil, tool.ErrInvalidArgument
	}
	for _, item := range args.Candidates {
		if strings.TrimSpace(item.Value) == "" || len([]rune(item.Value)) > 500 {
			return nil, tool.ErrInvalidArgument
		}
	}
	post, err := s.posts.GetAdminPost(ctx, args.PostID)
	if err != nil {
		return nil, err
	}
	before, _ := json.Marshal(post)
	return &tool.Proposal{ActionType: "create_content_candidates", TargetType: "post", TargetID: &args.PostID, Payload: raw, BeforeSnapshot: before}, nil
}

func (s *Service) proposeSuggestion(_ context.Context, raw json.RawMessage) (*tool.Proposal, error) {
	var value domain.OperationalSuggestion
	if err := decode(raw, &value); err != nil {
		return nil, err
	}
	value.SourceType, value.SourceKey = strings.TrimSpace(value.SourceType), strings.TrimSpace(value.SourceKey)
	value.Title, value.Description = strings.TrimSpace(value.Title), strings.TrimSpace(value.Description)
	if value.SourceType == "" || value.SourceKey == "" || value.Title == "" || value.Description == "" ||
		(value.Priority != "low" && value.Priority != "medium" && value.Priority != "high") ||
		len(value.Evidence) == 0 || !json.Valid(value.Evidence) {
		return nil, tool.ErrInvalidArgument
	}
	return &tool.Proposal{ActionType: "create_operational_suggestion", TargetType: "operational_suggestion", Payload: raw}, nil
}

func (s *Service) Start(ctx context.Context) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			s.processOne(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (s *Service) processOne(ctx context.Context) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}
	var jobID, postID int64
	err = tx.QueryRowContext(ctx, `SELECT id, post_id FROM ai_link_health_jobs
		WHERE status IN ('queued','failed') AND available_at<=NOW() AND attempts<5
		ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&jobID, &postID)
	if errors.Is(err, sql.ErrNoRows) {
		_ = tx.Rollback()
		return
	}
	if err != nil {
		_ = tx.Rollback()
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_link_health_jobs SET status='running',
		attempts=attempts+1, claimed_at=NOW(), error_code=NULL WHERE id=$1`, jobID); err != nil {
		_ = tx.Rollback()
		return
	}
	if err = tx.Commit(); err != nil {
		return
	}
	args, _ := json.Marshal(map[string]any{"id": postID})
	_, raw, _, err := s.tools.Invoke(ctx, []string{"content.check_links"}, "content.check_links", args)
	if err == nil {
		err = s.saveLinkResults(ctx, postID, raw)
	}
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE ai_link_health_jobs SET status='failed',
			error_code='link_check_failed', available_at=NOW()+make_interval(secs=>LEAST(3600,attempts*attempts*30))
			WHERE id=$1`, jobID)
		s.logger.Warn("AI link health job failed", zap.Int64("job_id", jobID), zap.Error(err))
		return
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE ai_link_health_jobs SET status='succeeded', finished_at=NOW() WHERE id=$1`, jobID)
}

func (s *Service) saveLinkResults(ctx context.Context, postID int64, raw json.RawMessage) error {
	var payload struct {
		Results []struct {
			URL        string `json:"url"`
			StatusCode int    `json:"status_code"`
			OK         bool   `json:"ok"`
			Error      string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM ai_link_health_snapshots WHERE post_id=$1`, postID); err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, result := range payload.Results {
		sum := sha256.Sum256([]byte(result.URL))
		errorCode := any(nil)
		if result.Error != "" {
			errorCode = strings.ReplaceAll(result.Error, " ", "_")
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO ai_link_health_snapshots
			(post_id,url,url_hash,status_code,ok,error_code) VALUES ($1,$2,$3,$4,$5,$6)`,
			postID, result.URL, hex.EncodeToString(sum[:]), nullableStatus(result.StatusCode), result.OK, errorCode)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	// A fresh successful check is authoritative for this post. Close an old
	// actionable suggestion only after the complete snapshot has been replaced;
	// a later failing check can reopen the resolved item with new evidence.
	if _, err = tx.ExecContext(ctx, `UPDATE ai_operational_suggestions
		SET status='resolved', ignored_reason=NULL, updated_at=NOW()
		WHERE source_type='broken_links' AND (source_key=$2 OR source_key='post:'||$2) AND status='new'
		  AND NOT EXISTS (SELECT 1 FROM ai_link_health_snapshots
			WHERE post_id=$1 AND ok=false
			  AND (error_code IS NULL OR error_code NOT IN ('link_target_is_not_public','link_host_could_not_be_resolved')))`, postID, fmt.Sprint(postID)); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func nullableStatus(value int) any {
	if value == 0 {
		return nil
	}
	return value
}

func (s *Service) listBrokenLinks(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		MaxAgeHours int `json:"max_age_hours"`
		Limit       int `json:"limit"`
	}
	if err := decode(raw, &args); err != nil {
		return nil, err
	}
	if args.MaxAgeHours == 0 {
		args.MaxAgeHours = 168
	}
	if args.Limit == 0 {
		args.Limit = 50
	}
	if args.MaxAgeHours < 1 || args.MaxAgeHours > 720 || args.Limit < 1 || args.Limit > 100 {
		return nil, tool.ErrInvalidArgument
	}
	rows, err := s.db.QueryContext(ctx, `SELECT l.post_id,p.title,p.slug,l.url,l.status_code,
		l.error_code,l.checked_at FROM ai_link_health_snapshots l JOIN posts p ON p.id=l.post_id
		WHERE l.ok=false AND (l.error_code IS NULL OR l.error_code NOT IN ('link_target_is_not_public','link_host_could_not_be_resolved'))
			AND p.status='published' AND l.checked_at>=NOW()-make_interval(hours=>$1)
		ORDER BY l.checked_at DESC LIMIT $2`, args.MaxAgeHours, args.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var postID int64
		var title, slug, url string
		var status sql.NullInt64
		var errorCode sql.NullString
		var checked time.Time
		if err := rows.Scan(&postID, &title, &slug, &url, &status, &errorCode, &checked); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"post_id": postID, "title": title, "slug": slug, "url": url,
			"status_code": statusValue(status), "error_code": stringValue(errorCode), "checked_at": checked})
	}
	return map[string]any{"time_window_hours": args.MaxAgeHours, "list": items, "total": len(items),
		"match_rule": "latest cached HTTP(S) check failed or returned a non-2xx/3xx status"}, rows.Err()
}

func (s *Service) listTagBloat(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		LowUsageThreshold int `json:"low_usage_threshold"`
		Limit             int `json:"limit"`
	}
	if err := decode(raw, &args); err != nil {
		return nil, err
	}
	if args.LowUsageThreshold == 0 {
		args.LowUsageThreshold = 1
	}
	if args.Limit == 0 {
		args.Limit = 50
	}
	if args.LowUsageThreshold < 1 || args.LowUsageThreshold > 20 || args.Limit < 1 || args.Limit > 100 {
		return nil, tool.ErrInvalidArgument
	}
	rows, err := s.db.QueryContext(ctx, `WITH counts AS (
		SELECT tag, lower(tag) normalized, COUNT(*) usage_count
		FROM posts, unnest(tags) tag WHERE status='published' GROUP BY tag
	), collisions AS (
		SELECT normalized, array_agg(tag ORDER BY tag) variants FROM counts GROUP BY normalized HAVING COUNT(*)>1
	)
	SELECT c.tag,c.usage_count,COALESCE(x.variants,'{}') FROM counts c
	LEFT JOIN collisions x ON x.normalized=c.normalized
	WHERE c.usage_count<=$1 OR x.variants IS NOT NULL
	ORDER BY c.usage_count,c.tag LIMIT $2`, args.LowUsageThreshold, args.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var tag string
		var count int64
		var variants []byte
		if err := rows.Scan(&tag, &count, &variants); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"tag": tag, "usage_count": count, "case_variants": parsePGArray(string(variants))})
	}
	var totalTags int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT tag) FROM posts,unnest(tags) tag WHERE status='published'`).Scan(&totalTags); err != nil {
		return nil, err
	}
	return map[string]any{"sampled_at": time.Now().UTC(), "total_tags": totalTags,
		"low_usage_threshold": args.LowUsageThreshold, "list": items, "total": len(items)}, rows.Err()
}

func decode(raw json.RawMessage, value any) error {
	if len(raw) > 32<<10 || !json.Valid(raw) {
		return tool.ErrInvalidArgument
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fmt.Errorf("%w: %v", tool.ErrInvalidArgument, err)
	}
	return nil
}

func statusValue(value sql.NullInt64) any {
	if value.Valid {
		return value.Int64
	}
	return nil
}
func stringValue(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}
func parsePGArray(value string) []string {
	value = strings.Trim(value, "{}")
	if value == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	for i := range parts {
		parts[i] = strings.Trim(parts[i], `"`)
	}
	return parts
}

func (s *Service) ListSuggestions(ctx context.Context, status string, limit int) ([]*domain.OperationalSuggestion, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,source_type,source_key,source_run_id,
		workflow_run_id,title,description,priority,evidence,window_start,window_end,status,
		ignored_reason,created_at,updated_at FROM ai_operational_suggestions
		WHERE ($1='' OR $1='all' OR status=$1) ORDER BY
		CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.OperationalSuggestion, 0)
	for rows.Next() {
		var item domain.OperationalSuggestion
		if err := rows.Scan(&item.ID, &item.SourceType, &item.SourceKey, &item.SourceRunID, &item.WorkflowRunID,
			&item.Title, &item.Description, &item.Priority, &item.Evidence, &item.WindowStart, &item.WindowEnd,
			&item.Status, &item.IgnoredReason, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (s *Service) IgnoreSuggestion(ctx context.Context, id int64, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("ignore reason is required")
	}
	result, err := s.db.ExecContext(ctx, `UPDATE ai_operational_suggestions SET status='ignored',
		ignored_reason=$2,updated_at=NOW() WHERE id=$1 AND status='new'`, id, reason)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Service) ConvertSuggestion(ctx context.Context, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	var title, description, priority string
	if err = tx.QueryRowContext(ctx, `SELECT title,description,priority FROM ai_operational_suggestions
		WHERE id=$1 AND status='new' FOR UPDATE`, id).Scan(&title, &description, &priority); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
		(title,description,priority,source_suggestion_id) VALUES($1,$2,$3,$4)`, title, description, priority, id); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_operational_suggestions SET status='converted',updated_at=NOW() WHERE id=$1`, id); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *Service) ListEditorialTasks(ctx context.Context, status string) ([]*domain.EditorialTask, error) {
	if status != "" && status != "all" && status != "open" && status != "done" && status != "cancelled" {
		return nil, tool.ErrInvalidArgument
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,title,description,priority,status,source_approval_id,source_suggestion_id,created_at
		FROM ai_editorial_tasks WHERE ($1='' OR $1='all' OR status=$1)
		ORDER BY CASE status WHEN 'open' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, created_at DESC`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.EditorialTask, 0)
	for rows.Next() {
		var item domain.EditorialTask
		var approvalID, suggestionID sql.NullInt64
		if err := rows.Scan(&item.ID, &item.Title, &item.Description, &item.Priority, &item.Status, &approvalID, &suggestionID, &item.CreatedAt); err != nil {
			return nil, err
		}
		if approvalID.Valid {
			item.SourceApprovalID = &approvalID.Int64
		}
		if suggestionID.Valid {
			item.SourceSuggestionID = &suggestionID.Int64
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (s *Service) UpdateEditorialTaskStatus(ctx context.Context, id int64, status string) error {
	if id <= 0 || (status != "done" && status != "cancelled") {
		return tool.ErrInvalidArgument
	}
	result, err := s.db.ExecContext(ctx, `UPDATE ai_editorial_tasks SET status=$2 WHERE id=$1 AND status='open'`, id, status)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Service) CreateSuggestion(ctx context.Context, value *domain.OperationalSuggestion) error {
	rawKey := strings.Join([]string{value.SourceType, value.SourceKey, value.Title}, ":")
	sum := sha256.Sum256([]byte(rawKey))
	value.DedupeKey = hex.EncodeToString(sum[:])
	if len(value.Evidence) == 0 {
		value.Evidence = json.RawMessage(`{}`)
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO ai_operational_suggestions
		(source_type,source_key,source_run_id,workflow_run_id,title,description,priority,evidence,
		 window_start,window_end,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT(dedupe_key) DO UPDATE SET evidence=EXCLUDED.evidence,window_start=EXCLUDED.window_start,
		window_end=EXCLUDED.window_end,priority=EXCLUDED.priority,
		status=CASE WHEN ai_operational_suggestions.status='resolved' THEN 'new' ELSE ai_operational_suggestions.status END,
		ignored_reason=CASE WHEN ai_operational_suggestions.status='resolved' THEN NULL ELSE ai_operational_suggestions.ignored_reason END,
		updated_at=NOW()
		WHERE ai_operational_suggestions.status IN ('new','resolved')`, value.SourceType, value.SourceKey, value.SourceRunID,
		value.WorkflowRunID, value.Title, value.Description, value.Priority, value.Evidence, value.WindowStart,
		value.WindowEnd, value.DedupeKey)
	return err
}

func (s *Service) RefreshSuggestions(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `SELECT l.post_id,p.title,p.slug,COUNT(*),MAX(l.checked_at)
		FROM ai_link_health_snapshots l JOIN posts p ON p.id=l.post_id
		WHERE l.ok=false
		  AND (l.error_code IS NULL OR l.error_code NOT IN ('link_target_is_not_public','link_host_could_not_be_resolved'))
		  AND p.status='published' GROUP BY l.post_id,p.title,p.slug`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var postID, count int64
		var title, slug string
		var checked time.Time
		if err := rows.Scan(&postID, &title, &slug, &count, &checked); err != nil {
			return err
		}
		evidence, _ := json.Marshal(map[string]any{"post_id": postID, "slug": slug, "broken_links": count, "checked_at": checked})
		start, end := checked.Add(-7*24*time.Hour), checked
		if err := s.CreateSuggestion(ctx, &domain.OperationalSuggestion{SourceType: "broken_links", SourceKey: fmt.Sprint(postID),
			Title: "Review broken links in " + title, Description: "Cached link checks found one or more failing external links.",
			Priority: "high", Evidence: evidence, WindowStart: &start, WindowEnd: &end}); err != nil {
			return err
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	// Reconcile the complete snapshot, including posts that no longer have any
	// failing rows. Without this pass, a successful refresh could leave an old
	// broken-links suggestion in the actionable queue indefinitely.
	if _, err := s.db.ExecContext(ctx, `UPDATE ai_operational_suggestions s
		SET status='resolved', ignored_reason=NULL, updated_at=NOW()
		WHERE s.source_type='broken_links' AND s.status='new'
		  AND NOT EXISTS (
			SELECT 1
			FROM ai_link_health_snapshots l
			JOIN posts p ON p.id=l.post_id
			WHERE (s.source_key=l.post_id::text OR s.source_key='post:'||l.post_id::text)
			  AND p.status='published'
			  AND l.ok=false
			  AND (l.error_code IS NULL OR l.error_code NOT IN ('link_target_is_not_public','link_host_could_not_be_resolved'))
		  )`); err != nil {
		return err
	}
	var totalTags, lowUse int64
	if err := s.db.QueryRowContext(ctx, `WITH counts AS(SELECT tag,COUNT(*) n FROM posts,unnest(tags) tag
		WHERE status='published' GROUP BY tag) SELECT COUNT(*),COUNT(*) FILTER(WHERE n<=1) FROM counts`).Scan(&totalTags, &lowUse); err != nil {
		return err
	}
	if lowUse > 0 {
		now := time.Now().UTC()
		evidence, _ := json.Marshal(map[string]any{"total_tags": totalTags, "low_use_tags": lowUse, "threshold": 1})
		if err := s.CreateSuggestion(ctx, &domain.OperationalSuggestion{SourceType: "tag_bloat", SourceKey: "site",
			Title: "Consolidate low-use tags", Description: "Aggregate tag counts indicate taxonomy fragmentation.",
			Priority: "medium", Evidence: evidence, WindowEnd: &now}); err != nil {
			return err
		}
	} else if _, err := s.db.ExecContext(ctx, `UPDATE ai_operational_suggestions
		SET status='resolved', ignored_reason=NULL, updated_at=NOW()
		WHERE source_type='tag_bloat' AND source_key='site' AND status='new'`); err != nil {
		return err
	}
	return nil
}

func (s *Service) ListCandidateSets(ctx context.Context) ([]*domain.ContentCandidateSet, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,post_id,source_run_id,source_approval_id,field_type,
		before_value,status,selected_candidate_id,created_at,updated_at FROM ai_content_candidate_sets
		ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.ContentCandidateSet, 0)
	for rows.Next() {
		var item domain.ContentCandidateSet
		if err := rows.Scan(&item.ID, &item.PostID, &item.SourceRunID, &item.SourceApprovalID, &item.FieldType,
			&item.BeforeValue, &item.Status, &item.SelectedCandidateID, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		candidateRows, err := s.db.QueryContext(ctx, `SELECT id,value,rationale,created_at FROM ai_content_candidates
			WHERE candidate_set_id=$1 ORDER BY id`, item.ID)
		if err != nil {
			return nil, err
		}
		for candidateRows.Next() {
			var candidate domain.ContentCandidate
			if err := candidateRows.Scan(&candidate.ID, &candidate.Value, &candidate.Rationale, &candidate.CreatedAt); err != nil {
				candidateRows.Close()
				return nil, err
			}
			item.Candidates = append(item.Candidates, candidate)
		}
		if err := candidateRows.Close(); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (s *Service) SelectCandidate(ctx context.Context, setID, candidateID int64) error {
	if s.repo == nil || s.posts == nil {
		return errors.New("candidate governance is not configured")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	var postID, runID int64
	var fieldType, value string
	err = tx.QueryRowContext(ctx, `SELECT cs.post_id,cs.source_run_id,cs.field_type,c.value
		FROM ai_content_candidate_sets cs JOIN ai_content_candidates c ON c.candidate_set_id=cs.id
		WHERE cs.id=$1 AND c.id=$2 AND cs.status='pending' FOR UPDATE OF cs`, setID, candidateID).
		Scan(&postID, &runID, &fieldType, &value)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	post, err := s.posts.GetAdminPost(ctx, postID)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	payload := map[string]any{"id": postID}
	payload[fieldType] = value
	rawPayload, _ := json.Marshal(payload)
	before, _ := json.Marshal(post)
	call := &domain.AgentToolCall{RunID: runID, ToolName: "content.select_candidate", RiskLevel: domain.ToolRiskPropose,
		Arguments: json.RawMessage(fmt.Sprintf(`{"candidate_set_id":%d,"candidate_id":%d}`, setID, candidateID)), Status: domain.ToolCallExecuted}
	if err := s.repo.CreateToolCallTx(ctx, tx, call); err != nil {
		_ = tx.Rollback()
		return err
	}
	approval := &domain.AgentApproval{RunID: runID, ToolCallID: call.ID, ActionType: "update_post", TargetType: "post",
		TargetID: &postID, ProposedPayload: rawPayload, BeforeSnapshot: before}
	if err := s.repo.CreateApprovalTx(ctx, tx, approval); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_content_candidate_sets SET status='selected',
		selected_candidate_id=$2,updated_at=NOW() WHERE id=$1`, setID, candidateID); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *Service) SaveFeedback(ctx context.Context, value *domain.AIFeedback) error {
	if value.TargetType != "run" && value.TargetType != "approval" && value.TargetType != "suggestion" {
		return tool.ErrInvalidArgument
	}
	if value.Label != "adopted" && value.Label != "rejected" && value.Label != "invalid" {
		return tool.ErrInvalidArgument
	}
	if value.TargetID <= 0 || strings.TrimSpace(value.CreatedBy) == "" || len(value.Note) > 2000 {
		return tool.ErrInvalidArgument
	}
	return s.db.QueryRowContext(ctx, `INSERT INTO ai_feedback(target_type,target_id,label,note,created_by)
		VALUES($1,$2,$3,$4,$5) ON CONFLICT(target_type,target_id,created_by)
		DO UPDATE SET label=EXCLUDED.label,note=EXCLUDED.note,created_at=NOW()
		RETURNING id,created_at`, value.TargetType, value.TargetID, value.Label, strings.TrimSpace(value.Note), value.CreatedBy).
		Scan(&value.ID, &value.CreatedAt)
}

func (s *Service) OutcomeMetrics(ctx context.Context) (map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT target_type,label,COUNT(*) FROM ai_feedback
		GROUP BY target_type,label ORDER BY target_type,label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	feedback := make([]map[string]any, 0)
	for rows.Next() {
		var target, label string
		var count int64
		if err := rows.Scan(&target, &label, &count); err != nil {
			return nil, err
		}
		feedback = append(feedback, map[string]any{"target_type": target, "label": label, "count": count})
	}
	var suggestions, converted, ignored, candidates, selected int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*),COUNT(*) FILTER(WHERE status='converted'),
		COUNT(*) FILTER(WHERE status='ignored') FROM ai_operational_suggestions`).Scan(&suggestions, &converted, &ignored); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*),COUNT(*) FILTER(WHERE status='selected')
		FROM ai_content_candidate_sets`).Scan(&candidates, &selected); err != nil {
		return nil, err
	}
	ruleMetrics, err := s.metricRows(ctx, `SELECT s.source_type,f.label,COUNT(*),0::bigint
		FROM ai_feedback f JOIN ai_operational_suggestions s
			ON f.target_type='suggestion' AND f.target_id=s.id
		GROUP BY s.source_type,f.label ORDER BY s.source_type,f.label`)
	if err != nil {
		return nil, err
	}
	const runTargets = `WITH targets AS (
		SELECT f.label, CASE
			WHEN f.target_type='run' THEN f.target_id
			WHEN f.target_type='approval' THEN ap.run_id END run_id
		FROM ai_feedback f
		LEFT JOIN ai_approvals ap ON f.target_type='approval' AND ap.id=f.target_id
		WHERE f.target_type IN ('run','approval')
	)`
	skillMetrics, err := s.metricRows(ctx, runTargets+`
		SELECT COALESCE(r.skill_version_id::text,'unversioned'),t.label,COUNT(*),
			COALESCE(SUM(r.input_tokens+r.output_tokens),0)
		FROM targets t JOIN ai_agent_runs r ON r.id=t.run_id
		GROUP BY r.skill_version_id,t.label ORDER BY r.skill_version_id,t.label`)
	if err != nil {
		return nil, err
	}
	workflowMetrics, err := s.metricRows(ctx, runTargets+`
		SELECT COALESCE(r.workflow_version_id::text,'unversioned'),t.label,COUNT(*),
			COALESCE(SUM(r.input_tokens+r.output_tokens),0)
		FROM targets t JOIN ai_agent_runs r ON r.id=t.run_id
		GROUP BY r.workflow_version_id,t.label ORDER BY r.workflow_version_id,t.label`)
	if err != nil {
		return nil, err
	}
	return map[string]any{"feedback": feedback, "suggestions": suggestions, "converted": converted, "ignored": ignored,
		"candidate_sets": candidates, "selected_candidate_sets": selected, "rule_metrics": ruleMetrics,
		"skill_metrics": skillMetrics, "workflow_metrics": workflowMetrics}, rows.Err()
}

func (s *Service) metricRows(ctx context.Context, query string) ([]map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var key, label string
		var count, tokens int64
		if err := rows.Scan(&key, &label, &count, &tokens); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"key": key, "label": label, "count": count, "tokens": tokens})
	}
	return items, rows.Err()
}
