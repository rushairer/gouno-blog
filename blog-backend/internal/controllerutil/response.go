package controllerutil

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	communityrepository "github.com/rushairer/blog-backend/internal/community/repository"
	communityservice "github.com/rushairer/blog-backend/internal/community/service"
	"github.com/rushairer/blog-backend/internal/knowledge"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	"github.com/rushairer/blog-backend/internal/service"
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/blog-backend/internal/workflowplan"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
)

func getLogger(c *gin.Context) *zap.Logger {
	if raw, ok := c.Get("logger"); ok {
		if l, ok := raw.(*zap.Logger); ok && l != nil {
			return l
		}
	}
	return zap.L()
}

// ParamInt64 parses an integer parameter from the route context.
func ParamInt64(c *gin.Context, name string) (int64, bool) {
	value := c.Param(name)
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, fmt.Sprintf("invalid %s", name)))
		c.Abort()
		return 0, false
	}
	return id, true
}

// ParamPositiveID is an alias for ParamInt64 with standard positive identifier validation.
func ParamPositiveID(c *gin.Context, name string) (int64, bool) {
	return ParamInt64(c, name)
}

// WritePaginated responds with a standardized pagination envelope.
// Both page_size and pageSize are provided for client compatibility.
func WritePaginated(c *gin.Context, list any, total int, page, pageSize int) {
	if list == nil {
		list = []any{}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list":      list,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"pageSize":  pageSize,
	}))
}

// FormatValidationError transforms raw Gin binding and validator errors into user-friendly Chinese messages.
func FormatValidationError(err error) string {
	if err == nil {
		return ""
	}
	errStr := err.Error()
	switch {
	case strings.Contains(errStr, "'Title'") || strings.Contains(errStr, "for 'Title'"):
		return "请填写标题"
	case strings.Contains(errStr, "'Content'") || strings.Contains(errStr, "for 'Content'"):
		return "请填写正文内容"
	case strings.Contains(errStr, "'Slug'") || strings.Contains(errStr, "for 'Slug'"):
		return "请填写访问路径 (Slug)"
	case strings.Contains(errStr, "'Name'") || strings.Contains(errStr, "for 'Name'"):
		return "请填写名称"
	case strings.Contains(errStr, "'Email'") || strings.Contains(errStr, "for 'Email'"):
		return "请填写有效的邮箱地址"
	case strings.Contains(errStr, "EOF") || strings.Contains(errStr, "invalid character"):
		return "请求体格式无效，请检查提交数据"
	default:
		return "请求参数校验失败，请检查填写内容"
	}
}

// WriteValidationError formats validation errors and responds with HTTP 400.
func WriteValidationError(c *gin.Context, err error) {
	msg := FormatValidationError(err)
	c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, msg))
	c.Abort()
}

// WriteDomainError maps known domain and repository errors to standard HTTP status codes.
// It logs 5xx internal server errors at Error level with full context, and 4xx client errors at Warn level.
func WriteDomainError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, sql.ErrNoRows),
		errors.Is(err, service.ErrPostNotFound),
		errors.Is(err, communityservice.ErrPostNotFound),
		errors.Is(err, taxonomyservice.ErrCategoryNotFound),
		errors.Is(err, mediaservice.ErrMediaNotFound),
		errors.Is(err, pageservice.ErrPageNotFound),
		errors.Is(err, workflowservice.ErrNotFound),
		errors.Is(err, knowledge.ErrNotFound),
		errors.Is(err, agentservice.ErrNotFound):
		status = http.StatusNotFound

	case errors.Is(err, service.ErrSlugInUse),
		errors.Is(err, mediaservice.ErrMediaInUse),
		errors.Is(err, taxonomyservice.ErrCategorySlugInUse),
		errors.Is(err, pageservice.ErrDuplicateSlug),
		errors.Is(err, communityrepository.ErrDuplicateInteraction),
		errors.Is(err, workflowservice.ErrConflict),
		errors.Is(err, agentservice.ErrConflict),
		errors.Is(err, agentservice.ErrProviderInUse),
		errors.Is(err, agentservice.ErrAlreadyRunning),
		errors.Is(err, agentservice.ErrRunLimit),
		errors.Is(err, agentservice.ErrTokenBudget),
		errors.Is(err, agentservice.ErrApprovalConflict),
		errors.Is(err, agentservice.ErrApprovalExpired),
		errors.Is(err, workflowplan.ErrDefaultModelRequired),
		errors.Is(err, workflowplan.ErrAgentSkillRequired):
		status = http.StatusConflict

	case errors.Is(err, service.ErrPostTitleEmpty),
		errors.Is(err, service.ErrPostContentEmpty),
		errors.Is(err, service.ErrInvalidPostStatus),
		errors.Is(err, service.ErrScheduledPast),
		errors.Is(err, service.ErrInvalidPostID),
		errors.Is(err, service.ErrInvalidPostSlug),
		errors.Is(err, communityservice.ErrCommentAuthorEmpty),
		errors.Is(err, communityservice.ErrCommentContentEmpty),
		errors.Is(err, communityservice.ErrCommentContentTooLong),
		errors.Is(err, communityservice.ErrAuthorTooLong),
		errors.Is(err, communityservice.ErrParentCommentNotFound),
		errors.Is(err, communityservice.ErrInvalidCommentStatus),
		errors.Is(err, communityservice.ErrReportReasonTooLong),
		errors.Is(err, service.ErrInvalidVersion),
		errors.Is(err, mediaservice.ErrInvalidMediaPayload),
		errors.Is(err, mediaservice.ErrInvalidMediaID),
		errors.Is(err, taxonomyservice.ErrCategoryNameRequired),
		errors.Is(err, taxonomyservice.ErrInvalidCategoryID),
		errors.Is(err, taxonomyservice.ErrInvalidTagPayload),
		errors.Is(err, siteservice.ErrInvalidSettings),
		errors.Is(err, siteservice.ErrSettingValueTooLong),
		errors.Is(err, siteservice.ErrSiteTitleEmpty),
		errors.Is(err, siteservice.ErrInvalidRSSURL),
		errors.Is(err, siteservice.ErrInvalidGithubURL),
		errors.Is(err, siteservice.ErrInvalidFaviconURL),
		errors.Is(err, service.ErrBatchInvalidIDs),
		errors.Is(err, service.ErrBatchInvalidAction),
		errors.Is(err, pageservice.ErrReservedSlug),
		errors.Is(err, pageservice.ErrInvalidSlug),
		errors.Is(err, pageservice.ErrPageTitleEmpty),
		errors.Is(err, communityrepository.ErrParentCommentMismatch),
		errors.Is(err, communityrepository.ErrCommentDepthExceeded),
		errors.Is(err, workflowservice.ErrInvalid),
		errors.Is(err, knowledge.ErrInvalid),
		errors.Is(err, agentservice.ErrInvalid),
		errors.Is(err, workflowplan.ErrGoalRequired),
		errors.Is(err, workflowplan.ErrPlannerContract):
		status = http.StatusBadRequest
	}

	logger := getLogger(c)
	reqID, _ := c.Get("request_id")
	reqIDStr := ""
	if s, ok := reqID.(string); ok {
		reqIDStr = s
	}

	message := err.Error()
	if status >= http.StatusInternalServerError {
		if logger != nil {
			logger.Error("unhandled internal server error",
				zap.Error(err),
				zap.String("path", c.Request.URL.Path),
				zap.String("method", c.Request.Method),
				zap.String("request_id", reqIDStr),
			)
		}
		message = "internal server error"
	} else if logger != nil {
		logger.Warn("domain request rejected",
			zap.Error(err),
			zap.Int("status", status),
			zap.String("path", c.Request.URL.Path),
			zap.String("request_id", reqIDStr),
		)
	}

	resp := gouno.NewErrorResponse(status, message)
	if reqIDStr != "" {
		resp = resp.WithRequestID(reqIDStr)
	}
	c.JSON(status, resp)
	c.Abort()
}

// WriteServiceError is an alias for WriteDomainError for consistent service error dispatch.
func WriteServiceError(c *gin.Context, err error) {
	WriteDomainError(c, err)
}
