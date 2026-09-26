package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	externaldomain "github.com/rushairer/blog-backend/internal/externalcapability/domain"
	externalservice "github.com/rushairer/blog-backend/internal/externalcapability/service"
	"github.com/rushairer/blog-backend/internal/tool"
	"github.com/rushairer/gouno"
)

const externalClientContextKey = "external_api_client"

type CapabilityService interface {
	ExternalCatalog() []tool.CatalogItem
	CatalogForClient(*externaldomain.Client) []tool.CatalogItem
	CreateClient(context.Context, string, []string, int, *time.Time, *int64) (*externaldomain.CreatedClient, error)
	ListClients(context.Context) ([]externaldomain.Client, error)
	UpdateClient(context.Context, int64, string, []string, bool, int, *time.Time) (*externaldomain.Client, error)
	RotateClientKey(context.Context, int64) (*externaldomain.CreatedClient, error)
	RevokeClient(context.Context, int64) error
	Authenticate(context.Context, string) (*externaldomain.Client, error)
	Allow(context.Context, *externaldomain.Client) error
	Invoke(context.Context, *externaldomain.Client, string, json.RawMessage, string, string) (json.RawMessage, error)
}

type Controller struct {
	service CapabilityService
}

func New(service CapabilityService) *Controller {
	return &Controller{service: service}
}

type clientRequest struct {
	Name               string     `json:"name" binding:"required"`
	Capabilities       []string   `json:"capabilities"`
	Enabled            *bool      `json:"enabled,omitempty"`
	RateLimitPerMinute int        `json:"rate_limit_per_minute,omitempty"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
}

func bindJSON(c *gin.Context, value any) error {
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("request body must contain one JSON object")
	}
	return nil
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(c, externalservice.ErrInvalid)
		return 0, false
	}
	return id, true
}

func (ctrl *Controller) ListClients(c *gin.Context) {
	items, err := ctrl.service.ListClients(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) ListExternalCapabilities(c *gin.Context) {
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(ctrl.service.ExternalCatalog()))
}

func (ctrl *Controller) CreateClient(c *gin.Context) {
	var req clientRequest
	if err := bindJSON(c, &req); err != nil {
		writeError(c, externalservice.ErrInvalid)
		return
	}
	var principalID *int64
	if raw, ok := c.Get("blog_principal_id"); ok {
		switch value := raw.(type) {
		case int64:
			principalID = &value
		case int:
			parsed := int64(value)
			principalID = &parsed
		}
	}
	created, err := ctrl.service.CreateClient(
		c.Request.Context(), req.Name, req.Capabilities,
		req.RateLimitPerMinute, req.ExpiresAt, principalID,
	)
	if err != nil {
		writeError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(created))
}

func (ctrl *Controller) UpdateClient(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req clientRequest
	if err := bindJSON(c, &req); err != nil {
		writeError(c, externalservice.ErrInvalid)
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	item, err := ctrl.service.UpdateClient(
		c.Request.Context(), id, req.Name, req.Capabilities,
		enabled, req.RateLimitPerMinute, req.ExpiresAt,
	)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) RotateClientKey(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := ctrl.service.RotateClientKey(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) RevokeClient(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := ctrl.service.RevokeClient(c.Request.Context(), id); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"revoked": true}))
}

func (ctrl *Controller) Authenticate() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(c, externalservice.ErrUnauthorized)
			c.Abort()
			return
		}
		client, err := ctrl.service.Authenticate(
			c.Request.Context(), strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")),
		)
		if err != nil {
			writeError(c, err)
			c.Abort()
			return
		}
		c.Set(externalClientContextKey, client)
		c.Next()
	}
}

func (ctrl *Controller) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		client, ok := currentClient(c)
		if !ok {
			writeError(c, externalservice.ErrUnauthorized)
			c.Abort()
			return
		}
		if err := ctrl.service.Allow(c.Request.Context(), client); err != nil {
			writeError(c, err)
			c.Abort()
			return
		}
		c.Next()
	}
}

func (ctrl *Controller) Catalog(c *gin.Context) {
	client, ok := currentClient(c)
	if !ok {
		writeError(c, externalservice.ErrUnauthorized)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(ctrl.service.CatalogForClient(client)))
}

func (ctrl *Controller) Invoke(c *gin.Context) {
	client, ok := currentClient(c)
	if !ok {
		writeError(c, externalservice.ErrUnauthorized)
		return
	}
	var req struct {
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := bindJSON(c, &req); err != nil {
		writeError(c, externalservice.ErrInvalid)
		return
	}
	requestID, _ := c.Get("request_id")
	requestIDText, _ := requestID.(string)
	result, err := ctrl.service.Invoke(
		c.Request.Context(), client, c.Param("name"), req.Arguments,
		requestIDText, c.ClientIP(),
	)
	if err != nil {
		writeError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(json.RawMessage(result)))
}

func currentClient(c *gin.Context) (*externaldomain.Client, bool) {
	value, ok := c.Get(externalClientContextKey)
	client, valid := value.(*externaldomain.Client)
	return client, ok && valid && client != nil
}

func writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, externalservice.ErrInvalid):
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid external capability request"))
	case errors.Is(err, externalservice.ErrUnauthorized):
		c.Header("WWW-Authenticate", "Bearer")
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid external API key"))
	case errors.Is(err, externalservice.ErrForbidden):
		c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "external capability is not authorized"))
	case errors.Is(err, externalservice.ErrRateLimited):
		c.Header("Retry-After", "60")
		c.JSON(http.StatusTooManyRequests, gouno.NewErrorResponse(http.StatusTooManyRequests, "external capability rate limit exceeded"))
	case errors.Is(err, externalservice.ErrNotFound):
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "external API client not found"))
	default:
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "external capability operation failed"))
	}
}
