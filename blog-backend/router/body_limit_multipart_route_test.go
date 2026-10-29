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

// A caller-controlled MIME header may not widen the JSON limit.
func TestMultipartLimitCannotBeSpoofedOnNonUploadRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.RequestBodyLimitMiddleware())
	read := func(c *gin.Context) {
		if _, err := io.Copy(io.Discard, c.Request.Body); err != nil {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		c.Status(http.StatusNoContent)
	}
	router.POST("/api/admin/media", read)
	router.PUT("/api/admin/media", read)
	router.POST("/api/admin/media/:id", read)
	router.POST("/api/external/v1/capabilities/:name/invoke", read)

	cases := []struct {
		name, method, path, mime string
		unknownLength            bool
		bodySize                 int
		want                     int
	}{
		{"real-upload", http.MethodPost, "/api/admin/media", "multipart/form-data; boundary=fixture", false, middleware.MaxAPIJSONBody+1, http.StatusNoContent},
		{"spoof-json-endpoint", http.MethodPost, "/api/external/v1/capabilities/demo/invoke", "multipart/form-data; boundary=fixture", false, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"spoof-chunked", http.MethodPost, "/api/external/v1/capabilities/demo/invoke", "multipart/form-data; boundary=fixture", true, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"wrong-method", http.MethodPut, "/api/admin/media", "multipart/form-data; boundary=fixture", false, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"wrong-route", http.MethodPost, "/api/admin/media/123", "multipart/form-data; boundary=fixture", false, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"invalid-mime-prefix", http.MethodPost, "/api/admin/media", "multipart/form-data-fake; boundary=fixture", false, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"json-on-upload-route", http.MethodPost, "/api/admin/media", "application/json", false, middleware.MaxAPIJSONBody+1, http.StatusRequestEntityTooLarge},
		{"overlarge-real-upload", http.MethodPost, "/api/admin/media", "multipart/form-data; boundary=fixture", false, middleware.MaxAPIMultipartBody+1, http.StatusRequestEntityTooLarge},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, bytes.NewReader(make([]byte, tc.bodySize)))
			req.Header.Set("Content-Type", tc.mime)
			if tc.unknownLength {
				req.ContentLength = -1
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != tc.want {
				t.Fatalf("response status=%d, want=%d; body=%s", response.Code, tc.want, response.Body.String())
			}
		})
	}
}
