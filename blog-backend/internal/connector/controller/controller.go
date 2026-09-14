package controller

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/rushairer/blog-backend/internal/connector"
)

type Controller struct {
	connectors *connector.Service
}

type Options struct {
	Connectors *connector.Service
}

func New(opts Options) *Controller {
	return &Controller{connectors: opts.Connectors}
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
