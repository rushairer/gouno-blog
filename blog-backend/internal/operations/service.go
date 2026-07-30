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
	"github.com/rushairer/blog-backend/internal/tool"
	"go.uber.org/zap"
)

type Service struct {
	db     *sql.DB
	tools  *tool.Registry
	logger *zap.Logger
	wg     sync.WaitGroup
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
			Risk:       domain.ToolRiskRead, Execute: s.listBrokenLinks,
		},
		tool.Definition{
			Name: "content.list_tag_bloat", Description: "Identify low-use and case-colliding tags from aggregate post metadata.",
			Parameters: schema(`{"low_usage_threshold":{"type":"integer","minimum":1,"maximum":20},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Execute: s.listTagBloat,
		},
	)
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
		WHERE l.ok=false AND p.status='published' AND l.checked_at>=NOW()-make_interval(hours=>$1)
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
