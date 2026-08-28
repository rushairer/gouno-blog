package router

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

func TestRequestBodyLimitRejectsOversizedJSONBeforeHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.RequestBodyLimitMiddleware())
	router.POST("/api/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	req := httptest.NewRequest(http.MethodPost, "/api/write", bytes.NewReader(make([]byte, middleware.MaxAPIJSONBody+1)))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestRequestBodyLimitCapsChunkedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.RequestBodyLimitMiddleware())
	router.POST("/api/write", func(c *gin.Context) {
		_, err := io.ReadAll(c.Request.Body)
		if err == nil {
			c.Status(http.StatusNoContent)
			return
		}
		c.Status(http.StatusRequestEntityTooLarge)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/write", bytes.NewReader(make([]byte, middleware.MaxAPIJSONBody+1)))
	req.ContentLength = -1
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}
