package controller

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/gouno"
)

type ContentController struct {
	db *sql.DB
}

func NewContentController(db *sql.DB) *ContentController {
	return &ContentController{db: db}
}

var categorySlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type categoryRequest struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
}

func (ctrl *ContentController) ListCategories(c *gin.Context) {
	rows, err := ctrl.db.QueryContext(c, `
		SELECT c.id, c.name, c.slug, c.description, c.sort_order, c.created_at, c.updated_at,
		       COUNT(p.id) FILTER (WHERE p.status = 'published') AS post_count
		FROM categories c
		LEFT JOIN posts p ON p.category_id = c.id
		GROUP BY c.id
		ORDER BY c.sort_order, c.name`)
	if err != nil {
		writeContentError(c, err)
		return
	}
	defer rows.Close()
	result := make([]domain.Category, 0)
	for rows.Next() {
		var item domain.Category
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt, &item.PostCount); err != nil {
			writeContentError(c, err)
			return
		}
		result = append(result, item)
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *ContentController) ListCategoryPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	page, pageSize = normalizedPagination(page, pageSize, 10)
	var categoryID int64
	if err := ctrl.db.QueryRowContext(c, `SELECT id FROM categories WHERE slug = $1`, c.Param("slug")).Scan(&categoryID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		writeContentError(c, err)
		return
	}
	var total int
	if err := ctrl.db.QueryRowContext(c, `SELECT COUNT(*) FROM posts WHERE category_id = $1 AND status = 'published'`, categoryID).Scan(&total); err != nil {
		writeContentError(c, err)
		return
	}
	rows, err := ctrl.db.QueryContext(c, `
		SELECT id, title, slug, summary, content, tags, category_id,
		       COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''),
		       status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts WHERE category_id = $1 AND status = 'published'
		ORDER BY published_at DESC, created_at DESC LIMIT $2 OFFSET $3`,
		categoryID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeContentError(c, err)
		return
	}
	defer rows.Close()
	posts := make([]domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount,
			&post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			writeContentError(c, err)
			return
		}
		posts = append(posts, post)
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": posts, "total": total, "page": page, "pageSize": pageSize}))
}

func (ctrl *ContentController) GetAdminPost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
		return
	}
	var post domain.Post
	err = ctrl.db.QueryRowContext(c, `
		SELECT id, title, slug, summary, content, tags, category_id,
		       COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''),
		       status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts WHERE id=$1`, id).
		Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount,
			&post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
		return
	}
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *ContentController) BatchPosts(c *gin.Context) {
	var req struct {
		IDs    []int64 `json:"ids"`
		Action string  `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || len(req.IDs) > 100 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "between 1 and 100 post ids are required"))
		return
	}
	var (
		result sql.Result
		err    error
	)
	switch req.Action {
	case "publish":
		var invalidCount int
		err = ctrl.db.QueryRowContext(c, `
			SELECT COUNT(*) FROM posts
			WHERE id=ANY($1) AND (btrim(title) = '' OR btrim(content) = '')`,
			pq.Array(req.IDs)).Scan(&invalidCount)
		if err != nil {
			writeContentError(c, err)
			return
		}
		if invalidCount > 0 {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "posts must have a title and content before publishing"))
			return
		}
		result, err = ctrl.db.ExecContext(c, `UPDATE posts SET status='published', published_at=COALESCE(published_at, NOW()), scheduled_at=NULL, updated_at=NOW() WHERE id=ANY($1)`, pq.Array(req.IDs))
	case "draft":
		result, err = ctrl.db.ExecContext(c, `UPDATE posts SET status='draft', published_at=NULL, scheduled_at=NULL, updated_at=NOW() WHERE id=ANY($1)`, pq.Array(req.IDs))
	case "delete":
		result, err = ctrl.db.ExecContext(c, `DELETE FROM posts WHERE id=ANY($1)`, pq.Array(req.IDs))
	default:
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "action must be publish, draft, or delete"))
		return
	}
	if err != nil {
		writeContentError(c, err)
		return
	}
	affected, _ := result.RowsAffected()
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"affected": affected}))
}

func (ctrl *ContentController) CreateCategory(c *gin.Context) {
	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" || !categorySlugPattern.MatchString(req.Slug) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	var item domain.Category
	err := ctrl.db.QueryRowContext(c, `
		INSERT INTO categories (name, slug, description, sort_order) VALUES ($1, $2, $3, $4)
		RETURNING id, name, slug, description, sort_order, created_at, updated_at`,
		strings.TrimSpace(req.Name), req.Slug, req.Description, req.SortOrder).
		Scan(&item.ID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(item))
}

func (ctrl *ContentController) UpdateCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid category id"))
		return
	}
	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" || !categorySlugPattern.MatchString(req.Slug) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	result, err := ctrl.db.ExecContext(c, `UPDATE categories SET name=$1, slug=$2, description=$3, sort_order=$4, updated_at=NOW() WHERE id=$5`, req.Name, req.Slug, req.Description, req.SortOrder, id)
	if err != nil {
		writeContentError(c, err)
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) DeleteCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid category id"))
		return
	}
	result, err := ctrl.db.ExecContext(c, `DELETE FROM categories WHERE id=$1`, id)
	if err != nil {
		writeContentError(c, err)
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) ListAdminTags(c *gin.Context) {
	rows, err := ctrl.db.QueryContext(c, `SELECT tag, COUNT(*) FROM posts, unnest(tags) tag GROUP BY tag ORDER BY COUNT(*) DESC, tag`)
	if err != nil {
		writeContentError(c, err)
		return
	}
	defer rows.Close()
	result := make([]domain.TagSummary, 0)
	for rows.Next() {
		var item domain.TagSummary
		if err := rows.Scan(&item.Name, &item.PostCount); err != nil {
			writeContentError(c, err)
			return
		}
		result = append(result, item)
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *ContentController) RenameTag(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "new tag name is required"))
		return
	}
	oldName := c.Param("name")
	_, err := ctrl.db.ExecContext(c, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END
			FROM unnest(tags) value
		), updated_at = NOW()
		WHERE $1 = ANY(tags)`, oldName, strings.TrimSpace(req.Name))
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) DeleteTag(c *gin.Context) {
	_, err := ctrl.db.ExecContext(c, `UPDATE posts SET tags = array_remove(tags, $1), updated_at=NOW() WHERE $1 = ANY(tags)`, c.Param("name"))
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) MergeTags(c *gin.Context) {
	var req struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Source == "" || req.Target == "" || req.Source == req.Target {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "distinct source and target tags are required"))
		return
	}
	_, err := ctrl.db.ExecContext(c, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END FROM unnest(tags) value
		), updated_at=NOW() WHERE $1 = ANY(tags)`, req.Source, req.Target)
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) GetSiteSettings(c *gin.Context) {
	var raw []byte
	if err := ctrl.db.QueryRowContext(c, `SELECT settings FROM site_settings WHERE id=1`).Scan(&raw); err != nil {
		writeContentError(c, err)
		return
	}
	var settings map[string]string
	if err := json.Unmarshal(raw, &settings); err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}

var allowedSettingKeys = map[string]bool{
	"site_title": true, "site_description": true, "author_name": true, "author_bio": true,
	"email": true, "github_url": true, "rss_url": true, "default_seo_title": true, "default_seo_description": true,
}

func (ctrl *ContentController) UpdateSiteSettings(c *gin.Context) {
	var requested map[string]string
	if err := c.ShouldBindJSON(&requested); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid settings payload"))
		return
	}
	clean := make(map[string]string, len(requested))
	for key, value := range requested {
		if allowedSettingKeys[key] {
			clean[key] = strings.TrimSpace(value)
		}
	}
	if title, exists := clean["site_title"]; exists && title == "" {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "site title cannot be empty"))
		return
	}
	if rss, exists := clean["rss_url"]; exists {
		if rss == "" {
			clean["rss_url"] = "/feed.xml"
		} else if parsed, err := url.ParseRequestURI(rss); err != nil || (!strings.HasPrefix(rss, "/") && parsed.Scheme != "http" && parsed.Scheme != "https") {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "rss_url must be a site path or an http(s) URL"))
			return
		}
	}
	raw, _ := json.Marshal(clean)
	var saved []byte
	err := ctrl.db.QueryRowContext(c, `UPDATE site_settings SET settings = settings || $1::jsonb, updated_at=NOW() WHERE id=1 RETURNING settings`, string(raw)).Scan(&saved)
	if err != nil {
		writeContentError(c, err)
		return
	}
	var settings map[string]string
	_ = json.Unmarshal(saved, &settings)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}

func writeContentError(c *gin.Context, err error) {
	if strings.Contains(err.Error(), "duplicate key") {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "slug or name is already in use"))
		return
	}
	c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "internal server error"))
}
