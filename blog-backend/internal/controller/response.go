package controller

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync/atomic"

	"github.com/gin-gonic/gin"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
)

var globalLogger atomic.Pointer[zap.Logger]

// SetResponseLogger sets the global logger used by response helpers.
func SetResponseLogger(logger *zap.Logger) {
	globalLogger.Store(logger)
}

func getLogger(c *gin.Context) *zap.Logger {
	if raw, ok := c.Get("logger"); ok {
		if l, ok := raw.(*zap.Logger); ok && l != nil {
			return l
		}
	}
	if l := globalLogger.Load(); l != nil {
		return l
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
// Both `page_size` and `pageSize` are provided for 100% client compatibility.
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

// WriteDomainError maps known domain and repository errors to standard HTTP status codes.
// It logs 5xx internal server errors at Error level with full context, and 4xx client errors at Warn level.
func WriteDomainError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, sql.ErrNoRows),
		errors.Is(err, service.ErrPostNotFound),
		errors.Is(err, service.ErrCategoryNotFound),
		errors.Is(err, service.ErrPageNotFound),
		errors.Is(err, workflowservice.ErrNotFound),
		errors.Is(err, knowledge.ErrNotFound),
		errors.Is(err, agentservice.ErrNotFound):
		status = http.StatusNotFound

	case errors.Is(err, service.ErrSlugInUse),
		errors.Is(err, service.ErrMediaInUse),
		errors.Is(err, service.ErrCategorySlugInUse),
		errors.Is(err, service.ErrDuplicateSlug),
		errors.Is(err, repository.ErrDuplicateInteraction),
		errors.Is(err, workflowservice.ErrConflict),
		errors.Is(err, agentservice.ErrConflict),
		errors.Is(err, agentservice.ErrProviderInUse),
		errors.Is(err, agentservice.ErrAlreadyRunning),
		errors.Is(err, agentservice.ErrRunLimit),
		errors.Is(err, agentservice.ErrTokenBudget),
		errors.Is(err, agentservice.ErrApprovalConflict),
		errors.Is(err, agentservice.ErrApprovalExpired):
		status = http.StatusConflict

	case errors.Is(err, service.ErrPostTitleEmpty),
		errors.Is(err, service.ErrPostContentEmpty),
		errors.Is(err, service.ErrInvalidPostStatus),
		errors.Is(err, service.ErrScheduledPast),
		errors.Is(err, service.ErrInvalidPostID),
		errors.Is(err, service.ErrInvalidPostSlug),
		errors.Is(err, service.ErrInvalidCommentID),
		errors.Is(err, service.ErrCommentAuthorEmpty),
		errors.Is(err, service.ErrCommentContentEmpty),
		errors.Is(err, service.ErrCommentContentTooLong),
		errors.Is(err, service.ErrAuthorTooLong),
		errors.Is(err, service.ErrParentCommentNotFound),
		errors.Is(err, service.ErrInvalidCommentStatus),
		errors.Is(err, service.ErrReportReasonTooLong),
		errors.Is(err, service.ErrInvalidVersion),
		errors.Is(err, service.ErrInvalidMediaPayload),
		errors.Is(err, service.ErrInvalidMediaID),
		errors.Is(err, service.ErrCategoryNameRequired),
		errors.Is(err, service.ErrInvalidCategoryID),
		errors.Is(err, service.ErrInvalidTagPayload),
		errors.Is(err, service.ErrInvalidSettings),
		errors.Is(err, service.ErrSettingValueTooLong),
		errors.Is(err, service.ErrSiteTitleEmpty),
		errors.Is(err, service.ErrInvalidRSSURL),
		errors.Is(err, service.ErrInvalidGithubURL),
		errors.Is(err, service.ErrBatchInvalidIDs),
		errors.Is(err, service.ErrBatchInvalidAction),
		errors.Is(err, service.ErrReservedSlug),
		errors.Is(err, service.ErrInvalidSlug),
		errors.Is(err, service.ErrPageTitleEmpty),
		errors.Is(err, repository.ErrParentCommentMismatch),
		errors.Is(err, repository.ErrCommentDepthExceeded),
		errors.Is(err, workflowservice.ErrInvalid),
		errors.Is(err, knowledge.ErrInvalid),
		errors.Is(err, agentservice.ErrInvalid):
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

	baseResp := gouno.NewErrorResponse(status, message)
	resp := gin.H{
		"code":    baseResp.Code,
		"message": baseResp.Message,
	}
	if reqIDStr != "" {
		resp["request_id"] = reqIDStr
	}
	c.JSON(status, resp)
	c.Abort()
}

// WriteServiceError is an alias for WriteDomainError for consistent service error dispatch.
func WriteServiceError(c *gin.Context, err error) {
	WriteDomainError(c, err)
}

