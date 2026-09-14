package controller

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/connector"
	"github.com/rushairer/blog-backend/internal/knowledge"
)

type AgentController struct {
	knowledge  *knowledge.Service
	connectors *connector.Service
}

type AgentControllerOptions struct {
	Knowledge  *knowledge.Service
	Connectors *connector.Service
}

func NewAgentController(opts AgentControllerOptions) *AgentController {
	return &AgentController{
		knowledge:  opts.Knowledge,
		connectors: opts.Connectors,
	}
}

// NewAgentControllerWithOptions is retained while Knowledge and Connector
// transport still share this transitional flat controller shell.
func NewAgentControllerWithOptions(opts AgentControllerOptions) *AgentController {
	return NewAgentController(opts)
}

func bindAgentJSON(c *gin.Context, value any) error {
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
