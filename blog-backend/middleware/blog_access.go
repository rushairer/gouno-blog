package middleware

import (
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
			c.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "recent multi-factor authentication required"))
			return
		}
		c.Next()
	}
}
