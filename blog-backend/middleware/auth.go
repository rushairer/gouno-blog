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
	jwksURL string
	keys    map[string]*rsa.PublicKey
	mu      sync.RWMutex
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
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(v.jwksURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return err
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
	v.mu.Unlock()
	return nil
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
	return func(ctx *gin.Context) {
		authHeader := ctx.GetHeader("Authorization")
		if authHeader == "" {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "missing authorization header"))
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authorization format"))
			return
		}

		tokenStr := parts[1]
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			kid, _ := token.Header["kid"].(string)
			return verifier.GetPublicKey(kid)
		})

		if err != nil || !token.Valid {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid or expired token"))
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid token claims"))
			return
		}

		// Store account ID and claims in context
		sub, _ := claims["sub"].(string)
		ctx.Set("account_id", sub)
		ctx.Set("claims", claims)

		// Role authorization
		if requiredRole != "" {
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
				if rStr, ok := r.(string); ok && rStr == requiredRole {
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
