package knowledge

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/secretbox"
	"go.uber.org/zap"
)

var (
	ErrInvalid  = errors.New("invalid knowledge configuration")
	ErrNotFound = errors.New("knowledge resource not found")
)

type Service struct {
	db           *sql.DB
	secrets      *secretbox.Box
	allowedHosts []string
	logger       *zap.Logger
	cancel       context.CancelFunc
	wg           sync.WaitGroup
}

func NewService(db *sql.DB, secrets *secretbox.Box, allowedHosts []string, logger *zap.Logger) *Service {
	return &Service{db: db, secrets: secrets, allowedHosts: allowedHosts, logger: logger}
}

const embeddingColumns = `id, name, base_url, model, dimensions, api_key_ciphertext,
	api_key_nonce, api_key_last4, key_version, enabled, request_timeout_seconds, created_at, updated_at`

func scanEmbedding(scanner interface{ Scan(...any) error }) (*domain.EmbeddingProfile, error) {
	var value domain.EmbeddingProfile
	err := scanner.Scan(&value.ID, &value.Name, &value.BaseURL, &value.Model, &value.Dimensions,
		&value.APIKeyCiphertext, &value.APIKeyNonce, &value.APIKeyLast4, &value.KeyVersion,
		&value.Enabled, &value.RequestTimeoutSeconds, &value.CreatedAt, &value.UpdatedAt)
	value.HasAPIKey = len(value.APIKeyCiphertext) > 0
	return &value, err
}

func (s *Service) ListProfiles(ctx context.Context) ([]*domain.EmbeddingProfile, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+embeddingColumns+` FROM ai_embedding_profiles
		WHERE deleted_at IS NULL ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.EmbeddingProfile, 0)
	for rows.Next() {
		item, err := scanEmbedding(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetProfile(ctx context.Context, id int64) (*domain.EmbeddingProfile, error) {
	value, err := scanEmbedding(s.db.QueryRowContext(ctx, `SELECT `+embeddingColumns+`
		FROM ai_embedding_profiles WHERE id=$1 AND deleted_at IS NULL`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return value, err
}

func (s *Service) SaveProfile(ctx context.Context, value *domain.EmbeddingProfile, apiKey string) error {
	value.Name = strings.TrimSpace(value.Name)
	value.BaseURL = strings.TrimRight(strings.TrimSpace(value.BaseURL), "/")
	value.Model = strings.TrimSpace(value.Model)
	if value.RequestTimeoutSeconds == 0 {
		value.RequestTimeoutSeconds = 60
	}
	if value.Name == "" || value.Model == "" || value.Dimensions < 64 || value.Dimensions > 4096 {
		return fmt.Errorf("%w: name, model and dimensions are required", ErrInvalid)
	}
	if err := provider.ValidateUpstreamURL(ctx, value.BaseURL, s.allowedHosts); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if value.RequestTimeoutSeconds < 1 || value.RequestTimeoutSeconds > 600 {
		return fmt.Errorf("%w: timeout is outside allowed range", ErrInvalid)
	}
	replaceSecret := apiKey != ""
	if value.ID == 0 && !replaceSecret {
		return fmt.Errorf("%w: API key is required", ErrInvalid)
	}
	if replaceSecret {
		ciphertext, nonce, err := s.secrets.Encrypt(apiKey)
		if err != nil {
			return err
		}
		value.APIKeyCiphertext, value.APIKeyNonce = ciphertext, nonce
		value.APIKeyLast4, value.KeyVersion, value.HasAPIKey = secretbox.Last4(apiKey), s.secrets.KeyVersion(), true
	}
	if value.ID == 0 {
		return s.db.QueryRowContext(ctx, `INSERT INTO ai_embedding_profiles
			(name, base_url, model, dimensions, api_key_ciphertext, api_key_nonce, api_key_last4,
			 key_version, enabled, request_timeout_seconds)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			RETURNING id, created_at, updated_at`, value.Name, value.BaseURL, value.Model,
			value.Dimensions, value.APIKeyCiphertext, value.APIKeyNonce, value.APIKeyLast4,
			value.KeyVersion, value.Enabled, value.RequestTimeoutSeconds,
		).Scan(&value.ID, &value.CreatedAt, &value.UpdatedAt)
	}
	if replaceSecret {
		return s.db.QueryRowContext(ctx, `UPDATE ai_embedding_profiles SET name=$2, base_url=$3,
			model=$4, dimensions=$5, api_key_ciphertext=$6, api_key_nonce=$7, api_key_last4=$8,
			key_version=$9, enabled=$10, request_timeout_seconds=$11, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING created_at, updated_at`,
			value.ID, value.Name, value.BaseURL, value.Model, value.Dimensions, value.APIKeyCiphertext,
			value.APIKeyNonce, value.APIKeyLast4, value.KeyVersion, value.Enabled,
			value.RequestTimeoutSeconds).Scan(&value.CreatedAt, &value.UpdatedAt)
	}
	return s.db.QueryRowContext(ctx, `UPDATE ai_embedding_profiles SET name=$2, base_url=$3,
		model=$4, dimensions=$5, enabled=$6, request_timeout_seconds=$7, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING api_key_ciphertext, api_key_nonce, api_key_last4, key_version, created_at, updated_at`,
		value.ID, value.Name, value.BaseURL, value.Model, value.Dimensions, value.Enabled,
		value.RequestTimeoutSeconds).Scan(&value.APIKeyCiphertext, &value.APIKeyNonce,
		&value.APIKeyLast4, &value.KeyVersion, &value.CreatedAt, &value.UpdatedAt)
}

func (s *Service) DeleteProfile(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `UPDATE ai_embedding_profiles SET enabled=false,
		api_key_ciphertext=NULL, api_key_nonce=NULL, api_key_last4='', key_version=0,
		deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM ai_content_chunks WHERE embedding_profile_id=$1)`, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) embed(ctx context.Context, profile *domain.EmbeddingProfile, inputs []string) ([][]float64, error) {
	key, err := s.secrets.Decrypt(profile.APIKeyCiphertext, profile.APIKeyNonce, profile.KeyVersion)
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(map[string]any{"model": profile.Model, "input": inputs, "dimensions": profile.Dimensions})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, profile.BaseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+string(key))
	client := provider.NewSafeHTTPClient(s.allowedHosts, time.Duration(profile.RequestTimeoutSeconds)*time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("embedding upstream returned status %d", resp.StatusCode)
	}
	var payload struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
			Index     int       `json:"index"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	result := make([][]float64, len(inputs))
	for _, item := range payload.Data {
		if item.Index < 0 || item.Index >= len(result) || len(item.Embedding) != profile.Dimensions {
			return nil, errors.New("embedding upstream returned invalid dimensions")
		}
		result[item.Index] = item.Embedding
	}
	for _, item := range result {
		if len(item) != profile.Dimensions {
			return nil, errors.New("embedding upstream omitted an input")
		}
	}
	return result, nil
}

func (s *Service) TestProfile(ctx context.Context, id int64) (time.Duration, error) {
	profile, err := s.GetProfile(ctx, id)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	_, err = s.embed(ctx, profile, []string{"Gouno Blog embedding health check"})
	return time.Since(start), err
}

type chunk struct {
	Index, Start, End int
	Heading, Content  string
}

func splitMarkdown(text string) []chunk {
	runes := []rune(strings.TrimSpace(text))
	const target, overlap = 1200, 120
	items := make([]chunk, 0)
	for start, index := 0, 0; start < len(runes); index++ {
		end := min(start+target, len(runes))
		if end < len(runes) {
			for end > start+target/2 && runes[end-1] != '\n' {
				end--
			}
		}
		if end <= start {
			end = min(start+target, len(runes))
		}
		content := strings.TrimSpace(string(runes[start:end]))
		heading := ""
		for _, line := range strings.Split(content, "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "#") {
				heading = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#"))
				break
			}
		}
		if content != "" {
			items = append(items, chunk{Index: index, Start: start, End: end, Heading: heading, Content: content})
		}
		if end == len(runes) {
			break
		}
		start = max(end-overlap, start+1)
	}
	return items
}

func vectorLiteral(values []float64) string {
	parts := make([]string, len(values))
	for i, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			value = 0
		}
		parts[i] = strconv.FormatFloat(value, 'g', -1, 64)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func (s *Service) Start(ctx context.Context) {
	workerCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			s.processOne(workerCtx)
			select {
			case <-workerCtx.Done():
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
	var action, version string
	err = tx.QueryRowContext(ctx, `SELECT id, post_id, action, version_key
		FROM ai_content_index_jobs WHERE status IN ('queued','failed') AND available_at <= NOW()
		AND attempts < 5 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&jobID, &postID, &action, &version)
	if errors.Is(err, sql.ErrNoRows) {
		_ = tx.Rollback()
		return
	}
	if err != nil {
		_ = tx.Rollback()
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_content_index_jobs SET status='running',
		attempts=attempts+1, claimed_at=NOW(), error_code=NULL WHERE id=$1`, jobID); err != nil {
		_ = tx.Rollback()
		return
	}
	if err = tx.Commit(); err != nil {
		return
	}
	err = s.indexPost(ctx, postID, action, version)
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE ai_content_index_jobs SET status='failed',
			error_code='index_failed', available_at=NOW() + make_interval(secs => LEAST(300, attempts * attempts * 5))
			WHERE id=$1`, jobID)
		s.logger.Warn("AI content indexing failed", zap.Int64("job_id", jobID), zap.Error(err))
		return
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE ai_content_index_jobs SET status='succeeded',
		finished_at=NOW() WHERE id=$1`, jobID)
}

func (s *Service) indexPost(ctx context.Context, postID int64, action, version string) error {
	if action == "delete" {
		_, err := s.db.ExecContext(ctx, `DELETE FROM ai_content_chunks WHERE post_id=$1`, postID)
		return err
	}
	var title, summary, content, status string
	if err := s.db.QueryRowContext(ctx, `SELECT title, summary, content, status FROM posts WHERE id=$1`, postID).
		Scan(&title, &summary, &content, &status); err != nil {
		return err
	}
	if status != "published" {
		_, err := s.db.ExecContext(ctx, `DELETE FROM ai_content_chunks WHERE post_id=$1`, postID)
		return err
	}
	profiles, err := s.ListProfiles(ctx)
	if err != nil {
		return err
	}
	parts := splitMarkdown(strings.Join([]string{title, summary, content}, "\n\n"))
	for _, profile := range profiles {
		if !profile.Enabled {
			continue
		}
		inputs := make([]string, len(parts))
		for i := range parts {
			inputs[i] = parts[i].Content
		}
		vectors, err := s.embed(ctx, profile, inputs)
		if err != nil {
			return err
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM ai_content_chunks
			WHERE post_id=$1 AND embedding_profile_id=$2`, postID, profile.ID); err != nil {
			_ = tx.Rollback()
			return err
		}
		for i, part := range parts {
			_, err = tx.ExecContext(ctx, `INSERT INTO ai_content_chunks
				(post_id, embedding_profile_id, version_key, chunk_index, heading, content,
				 start_offset, end_offset, embedding)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)`, postID, profile.ID, version,
				part.Index, part.Heading, part.Content, part.Start, part.End, vectorLiteral(vectors[i]))
			if err != nil {
				_ = tx.Rollback()
				return err
			}
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

type SearchResult struct {
	CitationID    string  `json:"citation_id"`
	ChunkID       int64   `json:"chunk_id"`
	PostID        int64   `json:"post_id"`
	Title         string  `json:"title"`
	Slug          string  `json:"slug"`
	Snippet       string  `json:"snippet"`
	StartOffset   int     `json:"start_offset"`
	EndOffset     int     `json:"end_offset"`
	LexicalScore  float64 `json:"lexical_score"`
	SemanticScore float64 `json:"semantic_score"`
	Score         float64 `json:"score"`
}

func (s *Service) Search(ctx context.Context, query string, limit int, excludePostID int64) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("%w: query is required", ErrInvalid)
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		return nil, fmt.Errorf("%w: limit exceeds 20", ErrInvalid)
	}
	var profileID int64
	profile, err := scanEmbedding(s.db.QueryRowContext(ctx, `SELECT `+embeddingColumns+`
		FROM ai_embedding_profiles WHERE enabled=true AND deleted_at IS NULL ORDER BY id LIMIT 1`))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []SearchResult{}, nil
		}
		return nil, err
	}
	profileID = profile.ID
	vectors, err := s.embed(ctx, profile, []string{query})
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT c.id, c.post_id, p.title, p.slug,
		left(c.content, 600), c.start_offset, c.end_offset,
		ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', $1)) AS lexical,
		GREATEST(0, 1 - (c.embedding <=> $2::vector)) AS semantic
		FROM ai_content_chunks c JOIN posts p ON p.id=c.post_id
		WHERE c.embedding_profile_id=$3 AND p.status='published' AND ($4=0 OR p.id<>$4)
		ORDER BY (0.35 * ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', $1))
			+ 0.65 * GREATEST(0, 1 - (c.embedding <=> $2::vector))) DESC
		LIMIT $5`, query, vectorLiteral(vectors[0]), profileID, excludePostID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SearchResult, 0)
	for rows.Next() {
		var item SearchResult
		if err := rows.Scan(&item.ChunkID, &item.PostID, &item.Title, &item.Slug, &item.Snippet,
			&item.StartOffset, &item.EndOffset, &item.LexicalScore, &item.SemanticScore); err != nil {
			return nil, err
		}
		item.Score = 0.35*item.LexicalScore + 0.65*item.SemanticScore
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%d:%d:%d", item.PostID, item.ChunkID, item.StartOffset, item.EndOffset)))
		item.CitationID = "kb_" + hex.EncodeToString(sum[:8])
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Status(ctx context.Context) (map[string]any, error) {
	var queued, failed, chunks int64
	var oldest sql.NullTime
	if err := s.db.QueryRowContext(ctx, `SELECT
		COUNT(*) FILTER (WHERE status IN ('queued','running')),
		COUNT(*) FILTER (WHERE status='failed'),
		MIN(created_at) FILTER (WHERE status IN ('queued','running'))
		FROM ai_content_index_jobs`).Scan(&queued, &failed, &oldest); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_content_chunks`).Scan(&chunks); err != nil {
		return nil, err
	}
	var lag any
	if oldest.Valid {
		lag = time.Since(oldest.Time).Milliseconds()
	}
	return map[string]any{"queued": queued, "failed": failed, "chunks": chunks, "oldest_job_age_ms": lag}, nil
}

func (s *Service) RetryFailed(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `UPDATE ai_content_index_jobs SET status='queued',
		attempts=0, available_at=NOW(), error_code=NULL WHERE status='failed'`)
	return err
}

func (s *Service) Rebuild(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO ai_content_index_jobs (post_id, action, version_key)
		SELECT id, 'upsert', 'manual-' || extract(epoch FROM NOW())::text || '-' || id::text
		FROM posts WHERE status='published' ON CONFLICT DO NOTHING`)
	return err
}

func ValidateBaseURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Path == "" {
		return ErrInvalid
	}
	return nil
}
