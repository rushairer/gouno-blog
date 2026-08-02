package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

const maxRunResources = 100
const maxRunResourcesPerType = 50

type ResourceCatalog struct{ db *sql.DB }

func NewResourceCatalog(db *sql.DB) *ResourceCatalog { return &ResourceCatalog{db: db} }

func (s *Service) ListCatalog(ctx context.Context, resourceType string, query domain.ResourceQuery) ([]domain.ResourceOption, int, error) {
	return s.catalog.List(ctx, resourceType, query)
}

func resourcePaging(query domain.ResourceQuery) (int, int) {
	page, size := query.Page, query.PageSize
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}

func (c *ResourceCatalog) List(ctx context.Context, resourceType string, query domain.ResourceQuery) ([]domain.ResourceOption, int, error) {
	if !supportedResourceTypes[resourceType] {
		return nil, 0, fmt.Errorf("%w: unsupported resource type", ErrInvalid)
	}
	if err := validateResourceFilters(resourceType, query.Filters); err != nil {
		return nil, 0, err
	}
	if len(query.Keys) > 0 {
		if len(query.Keys) > maxRunResources {
			return nil, 0, fmt.Errorf("%w: resource lookup exceeds 100 keys", ErrInvalid)
		}
		items := make([]domain.ResourceOption, 0, len(query.Keys))
		seen := map[string]bool{}
		for _, rawKey := range query.Keys {
			key := strings.TrimSpace(rawKey)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			item, err := c.Resolve(ctx, resourceType, key)
			if errors.Is(err, ErrNotFound) {
				continue
			}
			if err != nil {
				return nil, 0, err
			}
			items = append(items, *item)
		}
		return items, len(items), nil
	}
	page, size := resourcePaging(query)
	offset := (page - 1) * size
	q := strings.TrimSpace(query.Query)
	var rows *sql.Rows
	var err error
	switch resourceType {
	case "post":
		older, _ := strconv.Atoi(query.Filters["updated_before_days"])
		publishedWithin, _ := strconv.Atoi(query.Filters["published_within_days"])
		minViews, _ := strconv.Atoi(query.Filters["min_views"])
		lowEngagement := query.Filters["low_engagement"] == "true"
		rows, err = c.db.QueryContext(ctx, `SELECT p.id::text,p.title,COALESCE(p.summary,''),p.status::text,p.updated_at::text,
			jsonb_build_object('slug',p.slug,'tags',p.tags,'views_count',p.views_count,'likes_count',p.likes_count),COUNT(*) OVER()
			FROM posts p LEFT JOIN categories c ON c.id=p.category_id
			WHERE ($1='' OR p.title ILIKE '%'||$1||'%' OR p.summary ILIKE '%'||$1||'%')
			AND ($2='' OR p.status::text=$2) AND ($3='' OR c.slug=$3)
			AND ($4='' OR $4=ANY(p.tags)) AND ($5=0 OR p.updated_at < NOW()-($5||' days')::interval)
			AND ($6=0 OR p.views_count >= $6)
			AND ($7=0 OR p.published_at >= NOW()-($7||' days')::interval)
			AND ($8='' OR p.published_at >= $8::timestamptz) AND ($9='' OR p.published_at <= $9::timestamptz)
			AND ($10='' OR p.updated_at >= $10::timestamptz) AND ($11='' OR p.updated_at <= $11::timestamptz)
			AND (NOT $12 OR (p.views_count >= 100 AND p.likes_count * 100 < p.views_count))
			ORDER BY p.updated_at DESC,p.id DESC LIMIT $13 OFFSET $14`, q, query.Filters["status"], query.Filters["category"], query.Filters["tag"], older, minViews, publishedWithin,
			query.Filters["published_after"], query.Filters["published_before"], query.Filters["updated_after"], query.Filters["updated_before"], lowEngagement, size, offset)
	case "comment":
		postID, _ := strconv.ParseInt(query.Filters["post_id"], 10, 64)
		reported := query.Filters["reported"] == "true"
		rows, err = c.db.QueryContext(ctx, `SELECT c.id::text,'Comment #'||c.id::text,left(c.content,180),c.status,c.created_at::text,
			jsonb_build_object('post_id',c.post_id,'report_count',(SELECT COUNT(*) FROM comment_reports cr WHERE cr.comment_id=c.id)),COUNT(*) OVER()
			FROM comments c WHERE ($1='' OR c.content ILIKE '%'||$1||'%') AND ($2='' OR $2='all' OR c.status=$2)
			AND ($3=0 OR c.post_id=$3) AND (NOT $4 OR EXISTS(SELECT 1 FROM comment_reports cr WHERE cr.comment_id=c.id))
			AND ($5='' OR c.created_at >= $5::timestamptz) AND ($6='' OR c.created_at <= $6::timestamptz)
			ORDER BY c.created_at DESC,c.id DESC LIMIT $7 OFFSET $8`, q, query.Filters["status"], postID, reported,
			query.Filters["created_after"], query.Filters["created_before"], size, offset)
	case "media_asset":
		inUse := query.Filters["in_use"]
		missingAlt := query.Filters["missing_alt"] == "true"
		rows, err = c.db.QueryContext(ctx, `SELECT m.id::text,m.filename,m.alt_text,m.content_type,m.created_at::text,
			jsonb_build_object('url',m.url,'size_bytes',m.size_bytes,'usage_count',(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%'||m.url||'%' OR p.cover_url=m.url)),COUNT(*) OVER()
			FROM media_assets m WHERE ($1='' OR m.filename ILIKE '%'||$1||'%' OR m.alt_text ILIKE '%'||$1||'%')
			AND ($2='' OR m.content_type=$2)
			AND ($3='' OR m.created_at >= $3::timestamptz) AND ($4='' OR m.created_at <= $4::timestamptz)
			AND ($5='' OR ($5='true') = EXISTS(SELECT 1 FROM posts p WHERE p.content LIKE '%'||m.url||'%' OR p.cover_url=m.url))
			AND (NOT $6 OR BTRIM(COALESCE(m.alt_text,''))='')
			ORDER BY m.created_at DESC,m.id DESC LIMIT $7 OFFSET $8`, q, query.Filters["content_type"],
			query.Filters["created_after"], query.Filters["created_before"], inUse, missingAlt, size, offset)
	case "operational_suggestion":
		rows, err = c.db.QueryContext(ctx, `SELECT id::text,title,description,status,updated_at::text,
			jsonb_build_object('priority',priority,'source_type',source_type),COUNT(*) OVER()
			FROM ai_operational_suggestions WHERE ($1='' OR title ILIKE '%'||$1||'%' OR description ILIKE '%'||$1||'%')
			AND ($2='' OR $2='all' OR status=$2) AND ($3='' OR priority=$3) AND ($4='' OR source_type=$4)
			AND ($5='' OR created_at >= $5::timestamptz) AND ($6='' OR created_at <= $6::timestamptz)
			ORDER BY updated_at DESC,id DESC LIMIT $7 OFFSET $8`, q, query.Filters["status"], query.Filters["priority"], query.Filters["source_type"],
			query.Filters["created_after"], query.Filters["created_before"], size, offset)
	case "category":
		minPosts, _ := strconv.Atoi(query.Filters["min_post_count"])
		rows, err = c.db.QueryContext(ctx, `SELECT c.id::text,c.name,c.description,'category',c.updated_at::text,
			jsonb_build_object('slug',c.slug,'post_count',COUNT(p.id)),COUNT(*) OVER()
			FROM categories c LEFT JOIN posts p ON p.category_id=c.id WHERE ($1='' OR c.name ILIKE '%'||$1||'%' OR c.description ILIKE '%'||$1||'%')
			GROUP BY c.id HAVING ($2=0 OR COUNT(p.id)>=$2) ORDER BY c.sort_order,c.name LIMIT $3 OFFSET $4`, q, minPosts, size, offset)
	case "tag":
		minPosts, _ := strconv.Atoi(query.Filters["min_post_count"])
		rows, err = c.db.QueryContext(ctx, `SELECT tag,tag,COUNT(*)::text,'tag',MAX(p.updated_at)::text,
			jsonb_build_object('post_count',COUNT(*)),COUNT(*) OVER() FROM posts p CROSS JOIN LATERAL unnest(p.tags) tag
			WHERE ($1='' OR tag ILIKE '%'||$1||'%') GROUP BY tag HAVING ($2=0 OR COUNT(*)>=$2)
			ORDER BY COUNT(*) DESC,tag LIMIT $3 OFFSET $4`, q, minPosts, size, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]domain.ResourceOption, 0)
	total := 0
	for rows.Next() {
		var item domain.ResourceOption
		var metadata []byte
		if err := rows.Scan(&item.Key, &item.Label, &item.Description, &item.Status, &item.VersionToken, &metadata, &total); err != nil {
			return nil, 0, err
		}
		item.Type = resourceType
		item.Metadata = map[string]any{}
		_ = json.Unmarshal(metadata, &item.Metadata)
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (c *ResourceCatalog) Resolve(ctx context.Context, resourceType, key string) (*domain.ResourceOption, error) {
	query := domain.ResourceQuery{Page: 1, PageSize: 100, Filters: map[string]string{}}
	items, _, err := c.List(ctx, resourceType, query)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.Key == key {
			return &item, nil
		}
	}
	// Resolve beyond the first page without returning resource bodies.
	var label, description, status, version string
	var metadata []byte
	switch resourceType {
	case "post":
		err = c.db.QueryRowContext(ctx, `SELECT title,summary,status::text,updated_at::text,jsonb_build_object('slug',slug,'tags',tags,'views_count',views_count,'likes_count',likes_count) FROM posts WHERE id::text=$1`, key).Scan(&label, &description, &status, &version, &metadata)
	case "comment":
		err = c.db.QueryRowContext(ctx, `SELECT 'Comment #'||id::text,left(content,180),status,created_at::text,jsonb_build_object('post_id',post_id,'report_count',(SELECT COUNT(*) FROM comment_reports cr WHERE cr.comment_id=comments.id)) FROM comments WHERE id::text=$1`, key).Scan(&label, &description, &status, &version, &metadata)
	case "media_asset":
		err = c.db.QueryRowContext(ctx, `SELECT filename,alt_text,content_type,created_at::text,jsonb_build_object('url',url,'size_bytes',size_bytes) FROM media_assets WHERE id::text=$1`, key).Scan(&label, &description, &status, &version, &metadata)
	case "operational_suggestion":
		err = c.db.QueryRowContext(ctx, `SELECT title,description,status,updated_at::text,jsonb_build_object('priority',priority,'source_type',source_type) FROM ai_operational_suggestions WHERE id::text=$1`, key).Scan(&label, &description, &status, &version, &metadata)
	case "category":
		err = c.db.QueryRowContext(ctx, `SELECT name,description,'category',updated_at::text,jsonb_build_object('slug',slug) FROM categories WHERE id::text=$1`, key).Scan(&label, &description, &status, &version, &metadata)
	case "tag":
		err = c.db.QueryRowContext(ctx, `SELECT tag,COUNT(*)::text,'tag',MAX(updated_at)::text,jsonb_build_object('post_count',COUNT(*)) FROM posts CROSS JOIN LATERAL unnest(tags) tag WHERE tag=$1 GROUP BY tag`, key).Scan(&label, &description, &status, &version, &metadata)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	item := &domain.ResourceOption{Type: resourceType, Key: key, Label: label, Description: description, Status: status, VersionToken: version, Metadata: map[string]any{}}
	_ = json.Unmarshal(metadata, &item.Metadata)
	return item, nil
}

func resourceSnapshot(item *domain.ResourceOption) json.RawMessage {
	metadata := make(map[string]any, len(item.Metadata))
	for key, value := range item.Metadata {
		if key != "url" {
			metadata[key] = value
		}
	}
	raw, _ := json.Marshal(map[string]any{"label": item.Label, "status": item.Status, "metadata": metadata})
	return raw
}

func (s *Service) persistResource(ctx context.Context, runID int64, item *domain.ResourceOption, source, access string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources
		(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT(workflow_run_id,resource_type,resource_key) DO UPDATE SET
		access_level=CASE WHEN ai_workflow_run_resources.access_level='target' OR EXCLUDED.access_level='target' THEN 'target' ELSE 'read' END,
		source=CASE WHEN ai_workflow_run_resources.source='manual' THEN 'manual' ELSE EXCLUDED.source END`,
		runID, item.Type, item.Key, source, access, item.Label, item.VersionToken, resourceSnapshot(item))
	return err
}

func (s *Service) persistManualResources(ctx context.Context, runID int64, schemaRaw json.RawMessage, input any) error {
	fields, err := resourceFields(schemaRaw)
	if err != nil {
		return err
	}
	values, _ := input.(map[string]any)
	count := 0
	seen := map[string]bool{}
	byType := map[string]int{}
	for name, resourceType := range fields {
		raw, exists := values[name]
		if !exists {
			continue
		}
		keys := make([]string, 0)
		switch value := raw.(type) {
		case []any:
			for _, entry := range value {
				keys = append(keys, fmt.Sprint(entry))
			}
		default:
			keys = append(keys, fmt.Sprint(value))
		}
		for _, key := range keys {
			identity := resourceType + "\x00" + key
			if seen[identity] {
				continue
			}
			seen[identity] = true
			count++
			byType[resourceType]++
			if count > maxRunResources {
				return fmt.Errorf("%w: workflow input exceeds 100 resources", ErrInvalid)
			}
			if byType[resourceType] > maxRunResourcesPerType {
				return fmt.Errorf("%w: workflow input exceeds %d %s resources", ErrInvalid, maxRunResourcesPerType, resourceType)
			}
			item, err := s.catalog.Resolve(ctx, resourceType, key)
			if err != nil {
				return fmt.Errorf("%w: input field %q references unavailable %s %q", ErrInvalid, name, resourceType, key)
			}
			if err := s.persistResource(ctx, runID, item, "manual", "target"); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) ListResources(ctx context.Context, runID int64) ([]domain.WorkflowResource, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot,created_at
		FROM ai_workflow_run_resources WHERE workflow_run_id=$1 ORDER BY created_at,id`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.WorkflowResource, 0)
	for rows.Next() {
		var item domain.WorkflowResource
		if err := rows.Scan(&item.ID, &item.WorkflowRunID, &item.ResourceType, &item.ResourceKey, &item.Source, &item.AccessLevel, &item.Label, &item.VersionToken, &item.Snapshot, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func filtersFromRaw(raw json.RawMessage) (map[string]string, error) {
	if len(raw) == 0 {
		return map[string]string{}, nil
	}
	var values map[string]any
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, fmt.Errorf("%w: invalid resource query filter", ErrInvalid)
	}
	result := map[string]string{}
	for key, value := range values {
		result[key] = fmt.Sprint(value)
	}
	return result, nil
}

var resourceFilterKeys = map[string]map[string]bool{
	"post":                   {"status": true, "category": true, "tag": true, "updated_before_days": true, "published_within_days": true, "min_views": true, "low_engagement": true, "published_after": true, "published_before": true, "updated_after": true, "updated_before": true},
	"comment":                {"status": true, "reported": true, "post_id": true, "created_after": true, "created_before": true},
	"media_asset":            {"content_type": true, "in_use": true, "missing_alt": true, "created_after": true, "created_before": true},
	"operational_suggestion": {"status": true, "priority": true, "source_type": true, "created_after": true, "created_before": true},
	"category":               {"min_post_count": true},
	"tag":                    {"min_post_count": true},
}

func validateResourceFilters(resourceType string, filters map[string]string) error {
	allowed := resourceFilterKeys[resourceType]
	for key, value := range filters {
		if !allowed[key] {
			return fmt.Errorf("%w: unsupported %s filter %q", ErrInvalid, resourceType, key)
		}
		switch key {
		case "updated_before_days", "published_within_days", "min_views", "post_id", "min_post_count":
			if number, err := strconv.Atoi(value); err != nil || number < 0 {
				return fmt.Errorf("%w: filter %q must be a non-negative integer", ErrInvalid, key)
			}
		case "reported", "in_use", "missing_alt", "low_engagement":
			if value != "true" && value != "false" {
				return fmt.Errorf("%w: filter %q must be true or false", ErrInvalid, key)
			}
		case "published_after", "published_before", "updated_after", "updated_before", "created_after", "created_before":
			if value != "" {
				if _, err := time.Parse(time.RFC3339, value); err != nil {
					return fmt.Errorf("%w: filter %q must be RFC3339", ErrInvalid, key)
				}
			}
		}
	}
	return nil
}

func queryOutput(items []domain.ResourceOption) []map[string]any {
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		ref := map[string]any{"type": item.Type, "key": item.Key, "label": item.Label}
		if item.Type != "tag" {
			if id, err := strconv.ParseInt(item.Key, 10, 64); err == nil {
				ref["id"] = id
			}
		}
		result = append(result, ref)
	}
	return result
}
