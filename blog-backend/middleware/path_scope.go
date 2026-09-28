package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// SkipPathPrefixes keeps a middleware active everywhere except explicitly
// separated protocol surfaces. It is intended for cases where the excluded
// surface owns an independent, stronger policy at its route group.
func SkipPathPrefixes(handler gin.HandlerFunc, prefixes ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		for _, prefix := range prefixes {
			if prefix != "" && strings.HasPrefix(path, prefix) {
				c.Next()
				return
			}
		}
		handler(c)
	}
}
