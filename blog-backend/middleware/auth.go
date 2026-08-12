package middleware

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/gouno"
	"golang.org/x/sync/singleflight"
)

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type JWTVerifier struct {
	jwksURL       string
	keys          map[string]*rsa.PublicKey
	mu            sync.RWMutex
	sf            singleflight.Group
	lastRefreshed time.Time
}

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

// requestToken accepts an explicit Bearer token first, then the HttpOnly
// browser-session cookie issued by Gosso. The cookie path is deliberately a
// fallback so API clients retain standard OAuth behaviour.
func requestToken(ctx *gin.Context) (string, bool) {
	if token, ok := bearerToken(ctx); ok {
		return token, true
	}
	if token, err := ctx.Cookie("__Host-access_token"); err == nil && token != "" {
		return token, true
	}
	return "", false
}

func (v *JWTVerifier) VerifyToken(tokenStr string, options AuthOptions) (jwt.MapClaims, error) {
	parserOptions := make([]jwt.ParserOption, 0, 2)
	if options.Issuer != "" {
		parserOptions = append(parserOptions, jwt.WithIssuer(options.Issuer))
	}
	if options.Audience != "" {
		parserOptions = append(parserOptions, jwt.WithAudience(options.Audience))
	}
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		kid, _ := token.Header["kid"].(string)
		return v.GetPublicKey(kid)
	}, parserOptions...)
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid or expired token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	if options.ClientID != "" {
		if azp, _ := claims["azp"].(string); azp != "" && azp != options.ClientID {
			return nil, fmt.Errorf("invalid authorized party")
		}
		if clientID, _ := claims["client_id"].(string); clientID != "" && clientID != options.ClientID {
			return nil, fmt.Errorf("invalid client")
		}
	}
	return claims, nil
}

func setIdentity(ctx *gin.Context, claims jwt.MapClaims) {
	sub, _ := claims["sub"].(string)
	ctx.Set("account_id", sub)
	ctx.Set("claims", claims)
}

// OptionalAuth attaches verified identity when a bearer token is present.
// Missing credentials remain anonymous; malformed or invalid credentials are rejected.
func OptionalAuth(verifier *JWTVerifier, options AuthOptions) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenStr, ok := requestToken(ctx)
		if !ok {
			if ctx.GetHeader("Authorization") == "" {
				ctx.Next()
				return
			}
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authorization format"))
			return
		}
		claims, err := verifier.VerifyToken(tokenStr, options)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, err.Error()))
			return
		}
		setIdentity(ctx, claims)
		ctx.Next()
	}
}

func NewJWTVerifier(jwksURL string) *JWTVerifier {
	v := &JWTVerifier{
		jwksURL: jwksURL,
		keys:    make(map[string]*rsa.PublicKey),
	}
	// Fetch keys initially in background to avoid blocking server start
	go func() {
		for i := 0; i < 10; i++ {
			err := v.refreshKeys()
			if err == nil {
				break
			}
			time.Sleep(3 * time.Second)
		}
	}()
	return v
}

func (v *JWTVerifier) refreshKeys() error {
	v.mu.RLock()
	lastRefreshed := v.lastRefreshed
	v.mu.RUnlock()

	// 1 minute cooldown to prevent cache stampede/DoS spamming
	if time.Since(lastRefreshed) < 1*time.Minute {
		return nil
	}

	_, err, _ := v.sf.Do("refresh", func() (interface{}, error) {
		// Double check inside singleflight
		v.mu.RLock()
		lastRefreshedInner := v.lastRefreshed
		v.mu.RUnlock()
		if time.Since(lastRefreshedInner) < 1*time.Minute {
			return nil, nil
		}

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(v.jwksURL)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		var jwks JWKS
		if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
			return nil, err
		}

		newKeys := make(map[string]*rsa.PublicKey)
		for _, key := range jwks.Keys {
			if key.Kty == "RSA" && key.Use == "sig" && key.Alg == "RS256" {
				pubKey, err := parseJWK(key)
				if err == nil {
					newKeys[key.Kid] = pubKey
				}
			}
		}

		v.mu.Lock()
		v.keys = newKeys
		v.lastRefreshed = time.Now()
		v.mu.Unlock()
		return nil, nil
	})

	return err
}

func parseJWK(key JWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(key.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(key.E)
	if err != nil {
		return nil, err
	}

	var eVal int
	for _, b := range eBytes {
		eVal = (eVal << 8) | int(b)
	}

	pubKey := &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: eVal,
	}
	return pubKey, nil
}

func (v *JWTVerifier) GetPublicKey(kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key, ok := v.keys[kid]
	v.mu.RUnlock()
	if ok {
		return key, nil
	}

	// Try refreshing
	if err := v.refreshKeys(); err != nil {
		return nil, err
	}

	v.mu.RLock()
	key, ok = v.keys[kid]
	v.mu.RUnlock()
	if ok {
		return key, nil
	}
	return nil, fmt.Errorf("public key not found for kid: %s", kid)
}

func AuthMiddleware(verifier *JWTVerifier, requiredRole string) gin.HandlerFunc {
	return AuthMiddlewareWithOptions(verifier, AuthOptions{RequiredRole: requiredRole})
}

func AuthMiddlewareWithOptions(verifier *JWTVerifier, options AuthOptions) gin.HandlerFunc {
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
		tokenStr, ok := requestToken(ctx)
		if !ok {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "missing authorization header"))
			return
		}
		claims, err := verifier.VerifyToken(tokenStr, options)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, err.Error()))
			return
		}
		setIdentity(ctx, claims)

		// Role authorization
		if options.RequiredRole != "" {
			rolesRaw, exists := claims["roles"]
			if !exists {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden: missing roles claim"))
				return
			}
			rolesArr, ok := rolesRaw.([]interface{})
			if !ok {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden: invalid roles format"))
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
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "forbidden: insufficient permissions"))
				return
			}
		}

		ctx.Next()
	}
}
