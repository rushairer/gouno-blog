package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

// SafeAccessLogFormatter deliberately logs URL.Path rather than RequestURI.
// OAuth callbacks contain authorization codes and state in RawQuery, which are
// security-sensitive and must never be written to access logs.
func SafeAccessLogFormatter(param gin.LogFormatterParams) string {
	path := param.Path
	if param.Request != nil && param.Request.URL != nil {
		path = param.Request.URL.Path
	}
	return fmt.Sprintf("%s | %3d | %13v | %15s | %-7s %s\n",
		param.TimeStamp.Format(time.RFC3339), param.StatusCode, param.Latency,
		param.ClientIP, param.Method, path)
}
