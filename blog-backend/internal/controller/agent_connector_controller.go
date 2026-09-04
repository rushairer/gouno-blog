// Connector administration is under active product design. Do not extend or
// alter its routes, callback handling, or external integrations without an
// explicit user instruction naming connector work.
package controller

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/connector"
	"github.com/rushairer/gouno"
)

const connectorFlowCookie = "__Host-Http-blog-connector-flow"

func (ctrl *AgentController) SetConnectorService(value *connector.Service) { ctrl.connectors = value }

func (ctrl *AgentController) ListConnectorProfiles(c *gin.Context) {
	items, err := ctrl.connectors.ListProfiles(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) SaveConnectorProfile(c *gin.Context) {
	var req struct {
		connector.Profile
		Credential string `json:"credential"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.connectors.SaveProfile(c.Request.Context(), &req.Profile, req.Credential); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(req.Profile))
}

func (ctrl *AgentController) BeginConnectorOAuth(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if c.Query("provider") == "search_console" {
		state, authorizationURL, err := ctrl.connectors.BeginSearchConsoleOAuth(c.Request.Context(), id)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"state": state, "sandbox": false, "authorization_url": authorizationURL}))
		return
	}
	state, err := ctrl.connectors.BeginOAuth(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"state": state, "sandbox": true}))
}

func (ctrl *AgentController) BeginSearchConsoleOAuthRedirect(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	state, authorizationURL, err := ctrl.connectors.BeginSearchConsoleOAuth(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: connectorFlowCookie, Value: state, Path: "/", MaxAge: 600, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	c.Header("Cache-Control", "no-store")
	c.Redirect(http.StatusFound, authorizationURL)
}

func (ctrl *AgentController) CompleteConnectorOAuth(c *gin.Context) {
	var req struct {
		State    string `json:"state"`
		Code     string `json:"code"`
		Provider string `json:"provider"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	var err error
	if req.Provider == "search_console" {
		err = ctrl.connectors.CompleteSearchConsoleOAuth(c.Request.Context(), req.State, req.Code)
	} else {
		err = ctrl.connectors.CompleteOAuthMock(c.Request.Context(), req.State, req.Code)
	}
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"connected": true, "sandbox": req.Provider != "search_console"}))
}

// CompleteSearchConsoleOAuthCallback is the registered Google redirect URI.
// It intentionally consumes the code server-side and removes it from browser
// history by redirecting to the management UI.
func (ctrl *AgentController) CompleteSearchConsoleOAuthCallback(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	state := c.Query("state")
	cookieState, cookieErr := c.Cookie(connectorFlowCookie)
	http.SetCookie(c.Writer, &http.Cookie{Name: connectorFlowCookie, Path: "/", MaxAge: -1, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	if cookieErr != nil || len(state) == 0 || len(state) != len(cookieState) || subtle.ConstantTimeCompare([]byte(state), []byte(cookieState)) != 1 || c.Query("error") != "" || ctrl.connectors.CompleteSearchConsoleOAuth(c.Request.Context(), state, c.Query("code")) != nil {
		c.Redirect(http.StatusSeeOther, "/admin/ai-ops?tab=advanced&connector_oauth=failed")
		return
	}
	c.Redirect(http.StatusSeeOther, "/admin/ai-ops?tab=advanced&connector_oauth=connected")
}

func (ctrl *AgentController) SearchConsoleSummary(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	data, err := ctrl.connectors.SearchConsoleSummary(c.Request.Context(), id, req.StartDate, req.EndDate)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(json.RawMessage(data)))
}

func (ctrl *AgentController) ListConnectorOutbox(c *gin.Context) {
	items, err := ctrl.connectors.ListOutbox(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) QueueConnectorOutbox(c *gin.Context) {
	var req struct {
		ProfileID int64           `json:"connector_profile_id"`
		Key       string          `json:"idempotency_key"`
		Payload   json.RawMessage `json:"payload"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	item, err := ctrl.connectors.Queue(c.Request.Context(), req.ProfileID, req.Key, req.Payload)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) ApproveConnectorOutbox(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.connectors.Approve(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"approved": true}))
}

func (ctrl *AgentController) RevokeConnectorOutbox(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.connectors.Revoke(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"revoked": true}))
}

func (ctrl *AgentController) DeliverConnectorOutboxMock(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.connectors.DeliverMock(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"delivered": true, "transport": "mock"}))
}

func (ctrl *AgentController) RetryConnectorOutbox(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.connectors.Retry(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"retried": true}))
}
