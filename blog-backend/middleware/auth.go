package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/gouno"
	auth "github.com/rushairer/gouno/auth"
)

type AuthOptions struct {
	RequiredRole string
	Issuer       string
	Audience     string
	ClientID     string
}

// OptionalAuth preserves an identity projected by the Blog BFF.  The public
// Blog API intentionally does not accept provider Bearer tokens: permitting
// them would turn a browser-facing BFF endpoint back into a token API.
func OptionalAuth(verifier *auth.Verifier, options AuthOptions) gin.HandlerFunc {
	_ = verifier
	_ = options
	return func(ctx *gin.Context) {
		ctx.Next()
	}
}

func AuthMiddleware(verifier *auth.Verifier, requiredRole string) gin.HandlerFunc {
	return AuthMiddlewareWithOptions(verifier, AuthOptions{RequiredRole: requiredRole})
}

func AuthMiddlewareWithOptions(verifier *auth.Verifier, options AuthOptions) gin.HandlerFunc {
	_ = verifier

	return func(ctx *gin.Context) {
		var claims jwt.MapClaims
		if existing, verifiedByBFF := ctx.Get("claims"); verifiedByBFF {
			if m, ok := existing.(jwt.MapClaims); ok {
				claims = m
			}
		}

		if claims == nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "Blog BFF session required"))
			return
		}

		// Role authorization
		if options.RequiredRole != "" {
			rolesRaw, exists := claims["roles"]
			if !exists {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
				return
			}
			rolesArr, ok := rolesRaw.([]interface{})
			if !ok {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
				return
			}
			hasRole := false
			for _, r := range rolesArr {
				if rStr, ok := r.(string); ok && rStr == options.RequiredRole {
					hasRole = true
					break
				}
			}
			if !hasRole {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
				return
			}
		}

		ctx.Next()
	}
}
