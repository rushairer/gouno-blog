package controllerutil

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

// WriteJSONBindingError emits a fixed, transport-safe response for untrusted
// JSON decoding/validation errors. Go's JSON decoder and Gin validators may
// include attacker-controlled field names or private schema details in their
// Error() strings; never forward that text to API clients.
//
// tooLargeMessage is a caller-owned, fixed limit description (e.g. the
// existing Workflow 256 KiB contract), not a value derived from the request.
// If blank, the 413 response uses a generic bounded description.
func WriteJSONBindingError(c *gin.Context, err error, tooLargeMessage string) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		if tooLargeMessage == "" {
			tooLargeMessage = "request body too large"
		}
		c.JSON(http.StatusRequestEntityTooLarge, gouno.NewErrorResponse(http.StatusRequestEntityTooLarge, tooLargeMessage))
	} else {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid request body"))
	}
	c.Abort()
}
