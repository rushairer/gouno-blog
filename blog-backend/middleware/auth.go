package middleware

import (
	"net/http"
	"strings"

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

func bearerToken(ctx *gin.Context) (string, bool) {
	authHeader := ctx.GetHeader("Authorization")
	if authHeader == "" {
		return "", false
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", false
	}
	return parts[1], true
}

func verifyToken(verifier *auth.Verifier, tokenStr string, options AuthOptions) (jwt.MapClaims, error) {
	return verifier.Verify(tokenStr, auth.Options{
		Issuer:   options.Issuer,
		Audience: options.Audience,
		ClientID: options.ClientID,
	})
}

func setIdentity(ctx *gin.Context, claims jwt.MapClaims) {
	sub, _ := claims["sub"].(string)
	ctx.Set("account_id", sub)
	ctx.Set("claims", claims)
}

// OptionalAuth attaches verified identity when credentials are valid. Missing
// credentials remain anonymous. An explicit Bearer token is an API client's
// assertion and is therefore rejected when malformed or invalid.
func OptionalAuth(verifier *auth.Verifier, options AuthOptions) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if _, verifiedByBFF := ctx.Get("claims"); verifiedByBFF {
			ctx.Next()
			return
		}
		tokenStr, hasBearer := bearerToken(ctx)
		if !hasBearer {
			ctx.Next()
			return
		}
		if tokenStr == "" {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authorization format"))
			return
		}
		claims, err := verifyToken(verifier, tokenStr, options)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid or expired authentication"))
			return
		}
		setIdentity(ctx, claims)
		ctx.Next()
	}
}

func AuthMiddleware(verifier *auth.Verifier, requiredRole string) gin.HandlerFunc {
	return AuthMiddlewareWithOptions(verifier, AuthOptions{RequiredRole: requiredRole})
}

func AuthMiddlewareWithOptions(verifier *auth.Verifier, options AuthOptions) gin.HandlerFunc {
	if options.Issuer == "" {
		panic("AuthMiddleware: Issuer must not be empty")
	}
	if options.Audience == "" {
		panic("AuthMiddleware: Audience must not be empty")
	}
	if options.ClientID == "" {
		panic("AuthMiddleware: ClientID must not be empty")
	}

	return func(ctx *gin.Context) {
		var claims jwt.MapClaims
		if existing, verifiedByBFF := ctx.Get("claims"); verifiedByBFF {
			if m, ok := existing.(jwt.MapClaims); ok {
				claims = m
			}
		}

		if claims == nil {
			tokenStr, hasBearer := bearerToken(ctx)
			if !hasBearer || tokenStr == "" {
				ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "missing authorization header"))
				return
			}

			var err error
			claims, err = verifyToken(verifier, tokenStr, options)
			if err != nil {
				// Signature, issuer, audience and expiry diagnostics are useful to the
				// server log but must not become an oracle for unauthenticated callers.
				ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid or expired authentication"))
				return
			}
			setIdentity(ctx, claims)
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
