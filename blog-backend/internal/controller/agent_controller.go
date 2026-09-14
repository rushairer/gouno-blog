package controller

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/connector"
)

type AgentController struct {
	connectors *connector.Service
}

type AgentControllerOptions struct {
	Connectors *connector.Service
}

func NewAgentController(opts AgentControllerOptions) *AgentController {
	return &AgentController{connectors: opts.Connectors}
}

// NewAgentControllerWithOptions is retained while Connector transport remains
// on the explicitly held transitional flat controller shell.
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
