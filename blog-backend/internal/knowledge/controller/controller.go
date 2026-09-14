package controller

import (
	"encoding/json"
	"fmt"
	knowledgedomain "github.com/rushairer/blog-backend/internal/knowledge/domain"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/controllerutil"

	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/gouno"
)

type Controller struct {
	service *knowledge.Service
}

func New(service *knowledge.Service) *Controller {
	if service == nil {
		panic("knowledge controller: service is required")
	}
	return &Controller{service: service}
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
	return binding.Validator.ValidateStruct(value)
}

type embeddingProfileRequest struct {
	Name                  string `json:"name" binding:"required"`
	BaseURL               string `json:"base_url" binding:"required"`
	Model                 string `json:"model" binding:"required"`
	Dimensions            int    `json:"dimensions" binding:"required"`
	APIKey                string `json:"api_key"`
	Enabled               bool   `json:"enabled"`
	RequestTimeoutSeconds int    `json:"request_timeout_seconds"`
}

func (ctrl *Controller) ListEmbeddingProfiles(c *gin.Context) {
	items, err := ctrl.service.ListProfiles(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) CreateEmbeddingProfile(c *gin.Context) { ctrl.saveEmbeddingProfile(c, 0) }

func (ctrl *Controller) UpdateEmbeddingProfile(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveEmbeddingProfile(c, id)
}

func (ctrl *Controller) saveEmbeddingProfile(c *gin.Context, id int64) {
	var req embeddingProfileRequest
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	value := &knowledgedomain.EmbeddingProfile{ID: id, Name: req.Name, BaseURL: req.BaseURL,
		Model: req.Model, Dimensions: req.Dimensions, Enabled: req.Enabled,
		RequestTimeoutSeconds: req.RequestTimeoutSeconds}
	if err := ctrl.service.SaveProfile(c.Request.Context(), value, req.APIKey); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(value))
}

func (ctrl *Controller) DeleteEmbeddingProfile(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.service.DeleteProfile(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) TestEmbeddingProfile(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	duration, err := ctrl.service.TestProfile(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"ok": true, "latency_ms": duration.Milliseconds()}))
}

func (ctrl *Controller) IndexStatus(c *gin.Context) {
	value, err := ctrl.service.Status(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(value))
}

func (ctrl *Controller) RebuildIndex(c *gin.Context) {
	if err := ctrl.service.Rebuild(c.Request.Context()); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) RetryIndex(c *gin.Context) {
	if err := ctrl.service.RetryFailed(c.Request.Context()); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ReplaceIndexEvaluation(c *gin.Context) {
	var req struct {
		Cases []knowledge.EvaluationCase `json:"cases" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.service.ReplaceEvaluationCases(c.Request.Context(), req.Cases); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) EvaluateIndex(c *gin.Context) {
	result, err := ctrl.service.Evaluate(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
