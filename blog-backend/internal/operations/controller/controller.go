package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/operations"
	opsdomain "github.com/rushairer/blog-backend/internal/operations/domain"
	"github.com/rushairer/gouno"
)

const maxPageSize = 100

type Controller struct {
	service *operations.Service
}

func New(service *operations.Service) *Controller {
	if service == nil {
		panic("operations/controller.New: service is required")
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

func principalID(c *gin.Context) (int64, bool) {
	raw, exists := c.Get("blog_principal_id")
	value, ok := raw.(int64)
	return value, exists && ok && value > 0
}

func (ctrl *Controller) ListSuggestions(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > maxPageSize {
		limit = maxPageSize
	}
	items, err := ctrl.service.ListSuggestions(c.Request.Context(), c.DefaultQuery("status", "new"), limit)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) RefreshSuggestions(c *gin.Context) {
	if err := ctrl.service.RefreshSuggestions(c.Request.Context()); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) IgnoreSuggestion(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.service.IgnoreSuggestion(c.Request.Context(), id, req.Reason); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ConvertSuggestion(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.service.ConvertSuggestion(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ListEditorialTasks(c *gin.Context) {
	items, err := ctrl.service.ListEditorialTasks(c.Request.Context(), c.Query("status"))
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) UpdateEditorialTaskStatus(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.service.UpdateEditorialTaskStatus(c.Request.Context(), id, req.Status); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ListCandidateSets(c *gin.Context) {
	items, err := ctrl.service.ListCandidateSets(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) SelectCandidate(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		CandidateID int64 `json:"candidate_id" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.service.SelectCandidate(c.Request.Context(), id, req.CandidateID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) SaveFeedback(c *gin.Context) {
	var value opsdomain.AIFeedback
	if err := bindJSON(c, &value); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	id, ok := principalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	value.CreatedByPrincipalID = id
	if err := ctrl.service.SaveFeedback(c.Request.Context(), &value); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(&value))
}

func (ctrl *Controller) OutcomeMetrics(c *gin.Context) {
	result, err := ctrl.service.OutcomeMetrics(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
