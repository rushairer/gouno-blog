package controller

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/tool"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/blog-backend/internal/workflowplan"
	"github.com/rushairer/gouno"
)

const maxWorkflowJSONBody = 256 << 10
const minWebhookSecretLength = 32

type PlannerAgentCatalog interface {
	ListProviders(context.Context) ([]*domain.ProviderProfile, error)
	ListAgents(context.Context) ([]*domain.Agent, error)
	ProviderClient(context.Context, int64) (provider.Provider, error)
}

type ToolCatalog interface {
	Catalog() []tool.CatalogItem
}

type Controller struct {
	workflows     *workflowservice.Service
	interactions  *workflowservice.InteractionService
	plannerAgents PlannerAgentCatalog
	tools         ToolCatalog
	workerCtx     context.Context
}

func New(workflows *workflowservice.Service, interactions *workflowservice.InteractionService, plannerAgents PlannerAgentCatalog, tools ToolCatalog, workerCtx context.Context) *Controller {
	if workflows == nil || interactions == nil || plannerAgents == nil || tools == nil || workerCtx == nil {
		panic("workflow/controller.New: dependencies are required")
	}
	return &Controller{workflows: workflows, interactions: interactions, plannerAgents: plannerAgents, tools: tools, workerCtx: workerCtx}
}

func ValidWebhookSecret(value string) bool {
	return len(strings.TrimSpace(value)) >= minWebhookSecretLength
}

type workflowDraftRequest struct {
	Prompt string `json:"prompt" binding:"required"`
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

func bindWorkflowJSON(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWorkflowJSONBody)
	if err := bindJSON(c, value); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gouno.NewErrorResponse(http.StatusRequestEntityTooLarge, "workflow request body exceeds 256 KiB"))
		} else {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		}
		return false
	}
	return true
}

func bindHumanWorkflowJSON(c *gin.Context, value *workflowdomain.Workflow) error {
	if err := bindJSON(c, value); err != nil {
		return err
	}
	raw, exists := c.Get("blog_principal_id")
	principal, ok := raw.(int64)
	if !exists || !ok || principal <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return fmt.Errorf("authenticated local principal is required")
	}
	value.CreatedByPrincipalID = &principal
	value.CreationOrigin = ""
	return nil
}

func (ctrl *Controller) DraftWorkflow(c *gin.Context) {
	var req workflowDraftRequest
	if !bindWorkflowJSON(c, &req) {
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" || len([]rune(req.Prompt)) > 4000 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "workflow goal is required and must be at most 4000 characters"))
		return
	}
	profiles, err := ctrl.plannerAgents.ListProviders(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	agents, err := ctrl.plannerAgents.ListAgents(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	result, err := workflowplan.PlanWorkflow(
		c.Request.Context(),
		req.Prompt,
		profiles,
		agents,
		ctrl.tools.Catalog(),
		ctrl.workflows.ValidateDraft,
		ctrl.plannerAgents.ProviderClient,
	)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *Controller) ListWorkflows(c *gin.Context) {
	items, err := ctrl.workflows.List(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) GetWorkflow(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.workflows.Get(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) CreateWorkflow(c *gin.Context) { ctrl.saveWorkflow(c, 0) }

func (ctrl *Controller) UpdateWorkflow(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveWorkflow(c, id)
}

func (ctrl *Controller) DeleteWorkflow(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.Delete(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) saveWorkflow(c *gin.Context, id int64) {
	var value workflowdomain.Workflow
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWorkflowJSONBody)
	if err := bindHumanWorkflowJSON(c, &value); err != nil {
		if !c.IsAborted() {
			status := http.StatusBadRequest
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				status = http.StatusRequestEntityTooLarge
			}
			c.JSON(status, gouno.NewErrorResponse(status, err.Error()))
		}
		return
	}
	value.ID = id
	if err := ctrl.workflows.Save(c.Request.Context(), &value); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *Controller) ListWorkflowVersions(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.Versions(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) RollbackWorkflow(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Version int `json:"version" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.workflows.Rollback(c.Request.Context(), id, req.Version); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) EnableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, true) }

func (ctrl *Controller) DisableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, false) }

func (ctrl *Controller) setWorkflowEnabled(c *gin.Context, enabled bool) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if _, ok := interactionPrincipalID(c); !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	if err := ctrl.workflows.SetEnabled(c.Request.Context(), id, enabled); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *Controller) RunWorkflow(c *gin.Context)    { ctrl.queueWorkflow(c, false) }
func (ctrl *Controller) DryRunWorkflow(c *gin.Context) { ctrl.queueWorkflow(c, true) }

func (ctrl *Controller) PreflightWorkflow(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Input  json.RawMessage `json:"input"`
		DryRun bool            `json:"dry_run"`
	}
	if !bindWorkflowJSON(c, &req) {
		return
	}
	result, err := ctrl.workflows.Preflight(c.Request.Context(), id, req.Input, req.DryRun)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *Controller) RetryWorkflowRun(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		StepID     string `json:"step_id"`
		Iterations []int  `json:"iterations"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	run, err := ctrl.workflows.RetryFailed(c.Request.Context(), id, req.StepID, req.Iterations, &principalID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	go ctrl.workflows.Execute(ctrl.workerCtx, run.ID)
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *Controller) DeleteWorkflowRun(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.DeleteRun(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) CancelWorkflowRun(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.Cancel(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) EmitWorkflowEvent(c *gin.Context) {
	var req struct {
		EventKey string          `json:"event_key" binding:"required"`
		Event    string          `json:"event" binding:"required"`
		Payload  json.RawMessage `json:"payload" binding:"required"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	queued, err := ctrl.workflows.EmitEvent(c.Request.Context(), req.EventKey, req.Event, req.Payload, &principalID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(gin.H{"accepted": true, "queued": queued}))
}

var idempotencyKeyRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-\.]{1,128}$`)

func validateIdempotencyKey(key string) bool {
	return idempotencyKeyRegex.MatchString(key)
}

func parseWebhookHeaders(sigHeader, tsHeader string) (int64, string, error) {
	sigHeader = strings.TrimSpace(sigHeader)
	tsHeader = strings.TrimSpace(tsHeader)

	var timestamp int64
	var signatureHex string

	if strings.Contains(sigHeader, "=") && (strings.Contains(sigHeader, "t=") || strings.Contains(sigHeader, "v1=")) {
		parts := strings.Split(sigHeader, ",")
		for _, part := range parts {
			kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
			if len(kv) == 2 {
				k, v := strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1])
				if k == "t" {
					t, err := strconv.ParseInt(v, 10, 64)
					if err == nil {
						timestamp = t
					}
				} else if k == "v1" {
					signatureHex = v
				}
			}
		}
	} else {
		signatureHex = strings.TrimPrefix(sigHeader, "sha256=")
		signatureHex = strings.TrimPrefix(signatureHex, "v1=")
	}

	if timestamp == 0 && tsHeader != "" {
		t, err := strconv.ParseInt(tsHeader, 10, 64)
		if err == nil {
			timestamp = t
		}
	}

	if timestamp == 0 {
		return 0, "", fmt.Errorf("missing or invalid webhook timestamp")
	}
	if signatureHex == "" {
		return 0, "", fmt.Errorf("missing webhook signature")
	}

	return timestamp, signatureHex, nil
}

func canonicalWebhookPayload(method, event string, timestamp int64, idempotencyKey string, bodyDigest string) string {
	return fmt.Sprintf("v1\n%s\n%s\n%d\n%s\n%s",
		strings.ToUpper(strings.TrimSpace(method)),
		strings.ToLower(strings.TrimSpace(event)),
		timestamp,
		strings.TrimSpace(idempotencyKey),
		bodyDigest,
	)
}

func (ctrl *Controller) ReceiveWorkflowWebhook(c *gin.Context) {
	secret := strings.TrimSpace(os.Getenv("GOUNO_AI_WEBHOOK_SECRET"))
	if !ValidWebhookSecret(secret) {
		c.JSON(http.StatusServiceUnavailable, gouno.NewErrorResponse(http.StatusServiceUnavailable, "webhook connector is not configured"))
		return
	}

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20+1))
	if err != nil || len(body) == 0 || len(body) > 1<<20 || !json.Valid(body) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "webhook payload must be valid JSON under 1 MiB"))
		return
	}

	eventType := strings.TrimSpace(c.Param("event"))
	if eventType == "" || len(eventType) > 80 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid webhook event"))
		return
	}

	eventKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if eventKey == "" {
		eventKey = strings.TrimSpace(c.GetHeader("X-Event-ID"))
	}
	if eventKey == "" || !validateIdempotencyKey(eventKey) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "missing or invalid Idempotency-Key"))
		return
	}

	timestamp, providedSigHex, err := parseWebhookHeaders(c.GetHeader("X-Gouno-Signature"), c.GetHeader("X-Gouno-Timestamp"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	now := time.Now().Unix()
	const maxSkewSeconds = 300 // 5 minutes
	if timestamp < now-maxSkewSeconds {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "webhook timestamp expired"))
		return
	}
	if timestamp > now+maxSkewSeconds {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "webhook timestamp in the future"))
		return
	}

	bodySum := sha256.Sum256(body)
	bodyDigest := hex.EncodeToString(bodySum[:])

	canonical := canonicalWebhookPayload(c.Request.Method, eventType, timestamp, eventKey, bodyDigest)
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write([]byte(canonical))
	expected := hex.EncodeToString(digest.Sum(nil))

	providedBytes, decodeErr := hex.DecodeString(providedSigHex)
	expectedBytes, _ := hex.DecodeString(expected)
	if decodeErr != nil || len(providedBytes) != 32 || !hmac.Equal(providedBytes, expectedBytes) {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid webhook signature"))
		return
	}

	queued, err := ctrl.workflows.EmitEvent(c.Request.Context(), eventKey, eventType, body, nil)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(gin.H{"accepted": true, "queued": queued}))
}

func (ctrl *Controller) queueWorkflow(c *gin.Context, dryRun bool) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Input json.RawMessage `json:"input"`
	}
	if c.Request.ContentLength > 0 {
		if !bindWorkflowJSON(c, &req) {
			return
		}
	}
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	run, err := ctrl.workflows.Queue(c.Request.Context(), id, dryRun, req.Input, &principalID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	if run.Status == "queued" {
		go ctrl.workflows.Execute(ctrl.workerCtx, run.ID)
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *Controller) ListWorkflowRuns(c *gin.Context) {
	workflowID, _ := strconv.ParseInt(c.Query("workflow_id"), 10, 64)
	items, err := ctrl.workflows.ListRuns(c.Request.Context(), workflowID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) WorkflowRunSteps(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.RunSteps(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) WorkflowRunResources(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.ListResources(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) WorkflowRunInteractions(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.interactions.ListInteractions(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) WorkflowRunEvents(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.interactions.ListWorkflowRunEvents(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) GetInteraction(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.interactions.GetInteraction(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) ListPendingInteractions(c *gin.Context) {
	items, err := ctrl.interactions.ListPendingInteractions(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func interactionPrincipalID(c *gin.Context) (int64, bool) {
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	return principalID, exists && ok && principalID > 0
}

func (ctrl *Controller) ResolveInteraction(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		ResumeToken string          `json:"resume_token"`
		Response    json.RawMessage `json:"response"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if len(req.Response) == 0 {
		req.Response = json.RawMessage(`{}`)
	}
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	item, err := ctrl.interactions.ResolveInteraction(c.Request.Context(), id, req.ResumeToken, req.Response, principalID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) CancelInteraction(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		ResumeToken string `json:"resume_token"`
	}
	if err := bindJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	if err := ctrl.interactions.CancelInteraction(c.Request.Context(), id, req.ResumeToken, principalID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ListAIResources(c *gin.Context) {
	resourceType := c.Param("type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	page, pageSize = controllerutil.NormalizePagination(page, pageSize, 20)
	filters := map[string]string{}
	for key, values := range c.Request.URL.Query() {
		if key == "q" || key == "key" || key == "page" || key == "page_size" || len(values) == 0 {
			continue
		}
		filters[key] = values[0]
	}
	keys := c.QueryArray("key")
	items, total, err := ctrl.workflows.ListCatalog(c.Request.Context(), resourceType, workflowdomain.ResourceQuery{Query: c.Query("q"), Page: page, PageSize: pageSize, Filters: filters, Keys: keys})
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	unavailable := make([]string, 0)
	if len(keys) > 0 {
		resolved := make(map[string]bool, len(items))
		for _, item := range items {
			resolved[item.Key] = true
		}
		seen := map[string]bool{}
		for _, key := range keys {
			key = strings.TrimSpace(key)
			if key != "" && !seen[key] && !resolved[key] {
				seen[key] = true
				unavailable = append(unavailable, key)
			}
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": items, "total": total, "page": page, "page_size": pageSize, "unavailable_keys": unavailable}))
}

func (ctrl *Controller) WorkflowMetrics(c *gin.Context) {
	result, err := ctrl.workflows.Metrics(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
