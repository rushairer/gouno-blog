package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/gouno"
)

const BlogAccessContextKey = "blog_access"

// BlogAccess resolves Blog-local authorization after AuthMiddleware has already
// verified issuer, audience, client and signature. It deliberately never uses
// the SSO role claim as a Blog permission.
func BlogAccess(service *access.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsRaw, ok := c.Get("claims")
		claims, ok := claimsRaw.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authentication"))
			return
		}
		snapshot, err := service.Resolve(c.Request.Context(), claims)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gouno.NewErrorResponse(http.StatusServiceUnavailable, "authorization verification unavailable"))
			return
		}
		c.Set(BlogAccessContextKey, snapshot)
		c.Set("blog_principal_id", snapshot.Principal.ID)
		c.Next()
	}
}

// OptionalBlogAccess resolves Blog-local authorization if claims are present in context.
// If claims are missing or invalid, it allows the request to continue anonymously.
func OptionalBlogAccess(service *access.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsRaw, ok := c.Get("claims")
		if !ok {
			c.Next()
			return
		}
		claims, ok := claimsRaw.(jwt.MapClaims)
		if !ok {
			c.Next()
			return
		}
		snapshot, err := service.Resolve(c.Request.Context(), claims)
		if err == nil {
			c.Set(BlogAccessContextKey, snapshot)
		}
		c.Next()
	}
}

func CurrentBlogAccess(c *gin.Context) (access.Snapshot, bool) {
	value, ok := c.Get(BlogAccessContextKey)
	snapshot, valid := value.(access.Snapshot)
	return snapshot, ok && valid
}

func RequireBlogPermission(service *access.Service, permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		snapshot, ok := CurrentBlogAccess(c)
		if !ok || !service.Has(snapshot, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
			return
		}
		c.Next()
	}
}

func RequireAnyBlogPermission(service *access.Service, permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		snapshot, ok := CurrentBlogAccess(c)
		if !ok || snapshot.MembershipStatus != "active" {
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
			return
		}
		for _, p := range permissions {
			if service.Has(snapshot, p) {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
	}
}

func RequireActiveBlogMembership() gin.HandlerFunc {
	return func(c *gin.Context) {
		snapshot, ok := CurrentBlogAccess(c)
		if !ok || snapshot.MembershipStatus != "active" || len(snapshot.Roles) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden"))
			return
		}
		c.Next()
	}
}

func RequireRecentMFA() gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsRaw, ok := c.Get("claims")
		claims, valid := claimsRaw.(jwt.MapClaims)
		if !ok || !valid || !access.RecentMFA(claims, time.Now()) {
			// A document navigation cannot render the SPA Step-Up modal from a JSON
			// 403 response. Return to the AI console with an explicit one-shot UI
			// signal while keeping fetch/XHR callers on the normal API error path.
			if c.Request.Method == http.MethodGet &&
				(c.GetHeader("Sec-Fetch-Mode") == "navigate" || c.GetHeader("Sec-Fetch-Dest") == "document") {
				c.Redirect(http.StatusSeeOther, "/admin/ai-ops?mfa_step_up=1")
				c.Abort()
				return
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "recent multi-factor authentication required"))
			return
		}
		c.Next()
	}
}

// RequireRecentMFAForUnsafeMethods keeps read-only administration available
// at the AAL2 baseline while requiring a fresh assertion for state changes.
func RequireRecentMFAForUnsafeMethods() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		claimsRaw, ok := c.Get("claims")
		claims, valid := claimsRaw.(jwt.MapClaims)
		if !ok || !valid || !access.RecentMFA(claims, time.Now()) {
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "recent multi-factor authentication required"))
			return
		}
		c.Next()
	}
}

func AuditSensitiveChanges(service *access.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		c.Next()
		snapshot, ok := CurrentBlogAccess(c)
		if !ok || snapshot.Principal.ID <= 0 || service == nil {
			return
		}
		claims, _ := c.Get("claims")
		jwtClaims, _ := claims.(jwt.MapClaims)
		acr, _ := jwtClaims["acr"].(string)
		amr := make([]string, 0)
		switch values := jwtClaims["amr"].(type) {
		case []string:
			amr = append(amr, values...)
		case []any:
			for _, value := range values {
				if text, ok := value.(string); ok {
					amr = append(amr, text)
				}
			}
		}
		var authTime *time.Time
		switch value := jwtClaims["auth_time"].(type) {
		case float64:
			parsed := time.Unix(int64(value), 0)
			authTime = &parsed
		case int64:
			parsed := time.Unix(value, 0)
			authTime = &parsed
		case int:
			parsed := time.Unix(int64(value), 0)
			authTime = &parsed
		}
		sessionDigest := ""
		if raw, exists := c.Get("blog_bff_session_id"); exists {
			if handle, ok := raw.(string); ok && handle != "" {
				sum := sha256.Sum256([]byte(handle))
				sessionDigest = hex.EncodeToString(sum[:])
			}
		}
		requestID, _ := c.Get("request_id")
		requestIDText, _ := requestID.(string)
		result := "success"
		if c.Writer.Status() >= http.StatusBadRequest {
			result = "failed"
		}
		_ = service.RecordSecurityAudit(c.Request.Context(), access.SecurityAudit{
			ActorPrincipalID: snapshot.Principal.ID, Action: c.Request.Method + " " + c.FullPath(), Result: result,
			SessionID: sessionDigest, RequestID: requestIDText, SourceIP: c.ClientIP(), ACR: acr, AMR: amr, AuthTime: authTime,
		})
	}
}

// RequireAAL2 enforces the baseline strong-authentication assurance for Blog
// administration. RecentMFA adds the separate transaction freshness check.
func RequireAAL2() gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsRaw, ok := c.Get("claims")
		claims, valid := claimsRaw.(jwt.MapClaims)
		acr, _ := claims["acr"].(string)
		if !ok || !valid || acr != "urn:gouno:aal2" {
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "multi-factor authentication required"))
			return
		}
		c.Next()
	}
}
