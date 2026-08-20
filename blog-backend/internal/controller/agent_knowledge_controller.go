package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/gouno"
)

type embeddingProfileRequest struct {
	Name                  string `json:"name" binding:"required"`
	BaseURL               string `json:"base_url" binding:"required"`
	Model                 string `json:"model" binding:"required"`
	Dimensions            int    `json:"dimensions" binding:"required"`
	APIKey                string `json:"api_key"`
	Enabled               bool   `json:"enabled"`
	RequestTimeoutSeconds int    `json:"request_timeout_seconds"`
}

func (ctrl *AgentController) ListEmbeddingProfiles(c *gin.Context) {
	items, err := ctrl.knowledge.ListProfiles(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) CreateEmbeddingProfile(c *gin.Context) { ctrl.saveEmbeddingProfile(c, 0) }

func (ctrl *AgentController) UpdateEmbeddingProfile(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveEmbeddingProfile(c, id)
}

func (ctrl *AgentController) saveEmbeddingProfile(c *gin.Context, id int64) {
	var req embeddingProfileRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	value := &domain.EmbeddingProfile{ID: id, Name: req.Name, BaseURL: req.BaseURL,
		Model: req.Model, Dimensions: req.Dimensions, Enabled: req.Enabled,
		RequestTimeoutSeconds: req.RequestTimeoutSeconds}
	if err := ctrl.knowledge.SaveProfile(c.Request.Context(), value, req.APIKey); err != nil {
		WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(value))
}

func (ctrl *AgentController) DeleteEmbeddingProfile(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.knowledge.DeleteProfile(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) TestEmbeddingProfile(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	duration, err := ctrl.knowledge.TestProfile(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"ok": true, "latency_ms": duration.Milliseconds()}))
}

func (ctrl *AgentController) IndexStatus(c *gin.Context) {
	value, err := ctrl.knowledge.Status(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(value))
}

func (ctrl *AgentController) RebuildIndex(c *gin.Context) {
	if err := ctrl.knowledge.Rebuild(c.Request.Context()); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) RetryIndex(c *gin.Context) {
	if err := ctrl.knowledge.RetryFailed(c.Request.Context()); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ReplaceIndexEvaluation(c *gin.Context) {
	var req struct {
		Cases []knowledge.EvaluationCase `json:"cases" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.knowledge.ReplaceEvaluationCases(c.Request.Context(), req.Cases); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) EvaluateIndex(c *gin.Context) {
	result, err := ctrl.knowledge.Evaluate(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
