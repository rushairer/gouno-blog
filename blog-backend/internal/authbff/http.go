package authbff

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func (c *Client) RegisterRoutes(router gin.IRouter) {
	router.GET("/api/auth/login", c.loginHandler)
	router.GET("/api/auth/callback", c.callbackHandler)
	router.GET("/api/auth/me", c.meHandler)
	router.POST("/api/auth/refresh", c.refreshHandler)
	router.POST("/api/auth/logout", c.logoutHandler)
	router.GET("/api/auth/logout/callback", c.logoutCallbackHandler)
	router.POST("/api/auth/backchannel-logout", c.backchannelLogoutHandler)
}

// SessionMiddleware projects only already verified, server-side ID-token
// claims into the Blog authorization pipeline. It never accepts a provider
// token from a browser cookie.
func (c *Client) SessionMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		handle, err := ctx.Cookie(c.config.SessionCookie)
		if err != nil || handle == "" {
			ctx.Next()
			return
		}
		session, err := c.store.GetSession(ctx.Request.Context(), handle)
		if err != nil || session.Issuer != c.config.Issuer || session.Subject == "" {
			clearHostCookie(ctx, c.config.SessionCookie, http.SameSiteStrictMode)
			ctx.Next()
			return
		}
		if !session.TokenExpiry.IsZero() && session.TokenExpiry.Before(time.Now().Add(30*time.Second)) {
			session, err = c.Refresh(ctx.Request.Context(), handle)
			if err != nil {
				_ = c.store.DeleteSession(ctx.Request.Context(), handle)
				clearHostCookie(ctx, c.config.SessionCookie, http.SameSiteStrictMode)
				ctx.Next()
				return
			}
		}
		claims := jwt.MapClaims(session.Claims)
		claims["iss"], claims["sub"] = session.Issuer, session.Subject
		claims["sid"], claims["auth_time"], claims["amr"] = session.SID, session.AuthTime, session.AMR
		ctx.Set("account_id", session.Subject)
		ctx.Set("claims", claims)
		ctx.Set("blog_bff_session_id", handle)
		ctx.Next()
	}
}

func (c *Client) logoutCallbackHandler(ctx *gin.Context) {
	ctx.Header("Cache-Control", "no-store")
	if err := c.store.TakeLogoutState(ctx.Request.Context(), ctx.Query("state")); err != nil {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid logout state"})
		return
	}
	ctx.Redirect(http.StatusSeeOther, "/")
}

func (c *Client) loginHandler(ctx *gin.Context) {
	handle, target, err := c.Begin(ctx.Request.Context(), ctx.Query("return_to"))
	if err != nil {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "unable to start login"})
		return
	}
	setHostCookie(ctx, c.config.FlowCookie, handle, int(c.config.FlowTTL.Seconds()), http.SameSiteLaxMode)
	ctx.Header("Cache-Control", "no-store")
	ctx.Redirect(http.StatusFound, target)
}

func (c *Client) callbackHandler(ctx *gin.Context) {
	handle, err := ctx.Cookie(c.config.FlowCookie)
	clearHostCookie(ctx, c.config.FlowCookie, http.SameSiteLaxMode)
	if err != nil || handle == "" {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "login flow cookie is missing"})
		return
	}
	sessionHandle, _, returnTo, err := c.Complete(ctx.Request.Context(), handle, ctx.Request.URL.Query())
	if err != nil {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "login callback validation failed"})
		return
	}
	setHostCookie(ctx, c.config.SessionCookie, sessionHandle, int(c.config.SessionTTL.Seconds()), http.SameSiteStrictMode)
	ctx.Header("Cache-Control", "no-store")
	ctx.Redirect(http.StatusSeeOther, returnTo)
}

func (c *Client) meHandler(ctx *gin.Context) {
	ctx.Header("Cache-Control", "no-store")
	handle, err := ctx.Cookie(c.config.SessionCookie)
	if err != nil || handle == "" {
		ctx.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}
	session, err := c.store.GetSession(ctx.Request.Context(), handle)
	if err != nil || session.Issuer != c.config.Issuer || session.Subject == "" {
		clearHostCookie(ctx, c.config.SessionCookie, http.SameSiteStrictMode)
		ctx.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"authenticated": true,
		"user": gin.H{
			"id":         session.Subject,
			"issuer":     session.Issuer,
			"sid":        session.SID,
			"auth_time":  session.AuthTime,
			"amr":        session.AMR,
			"claims":     session.Claims,
			"expires_at": session.TokenExpiry.Unix(),
		},
	})
}

func (c *Client) refreshHandler(ctx *gin.Context) {
	ctx.Header("Cache-Control", "no-store")
	handle, err := ctx.Cookie(c.config.SessionCookie)
	if err != nil || handle == "" {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	session, err := c.Refresh(ctx.Request.Context(), handle)
	if err != nil {
		clearHostCookie(ctx, c.config.SessionCookie, http.SameSiteStrictMode)
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "refresh failed"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"ok":         true,
		"expires_at": session.TokenExpiry.Unix(),
	})
}

func (c *Client) logoutHandler(ctx *gin.Context) {
	ctx.Header("Cache-Control", "no-store")
	var session Session
	handle, err := ctx.Cookie(c.config.SessionCookie)
	if err == nil && handle != "" {
		session, _ = c.store.GetSession(ctx.Request.Context(), handle)
		_ = c.store.DeleteSession(ctx.Request.Context(), handle)
	}
	clearHostCookie(ctx, c.config.SessionCookie, http.SameSiteStrictMode)

	// Defense-in-depth: Immediately revoke refresh token via RFC 7009 server-to-server.
	if session.RefreshToken != "" {
		_ = c.RevokeToken(ctx.Request.Context(), session.RefreshToken, "refresh_token")
	} else if session.AccessToken != "" {
		_ = c.RevokeToken(ctx.Request.Context(), session.AccessToken, "access_token")
	}

	// The OP only receives the single exact, registered callback URI. Any
	// desired Blog-local destination is stored with the logout state rather than
	// being forwarded as an unregistered relative URI.
	logoutURL, _ := c.LogoutURL(ctx.Request.Context(), session, "")
	if ctx.Query("redirect") == "true" && logoutURL != "" {
		ctx.Redirect(http.StatusFound, logoutURL)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"ok":         true,
		"logout_url": logoutURL,
	})
}

func (c *Client) backchannelLogoutHandler(ctx *gin.Context) {
	ctx.Header("Cache-Control", "no-store")
	logoutToken := ctx.PostForm("logout_token")
	if logoutToken == "" {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "logout_token is required"})
		return
	}
	if err := c.BackChannelLogout(ctx.Request.Context(), logoutToken); err != nil {
		ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": err.Error()})
		return
	}
	ctx.Status(http.StatusOK)
}

func setHostCookie(ctx *gin.Context, name, value string, maxAge int, sameSite http.SameSite) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		Secure: true, HttpOnly: true, SameSite: sameSite,
	})
}

func clearHostCookie(ctx *gin.Context, name string, sameSite http.SameSite) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name: name, Path: "/", MaxAge: -1,
		Secure: true, HttpOnly: true, SameSite: sameSite,
	})
}
