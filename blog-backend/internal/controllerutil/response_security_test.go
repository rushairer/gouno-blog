package controllerutil

import (
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    "github.com/gin-gonic/gin"
    postdomain "github.com/rushairer/blog-backend/internal/post/domain"
)

func TestWriteDomainErrorNeverExposesWrappedDetails(t *testing.T) {
    gin.SetMode(gin.TestMode)
    cases := []struct {
        name string
        err error
        status int
        public string
        code string
    }{
        {"not found", fmt.Errorf("secret /srv/private.sql: %w", sql.ErrNoRows), http.StatusNotFound, "resource not found", ""},
        {"conflict", fmt.Errorf("db token=secret: %w", postdomain.ErrRevisionConflict), http.StatusConflict, "request conflict", "POST_REVISION_CONFLICT"},
        {"expected revision", fmt.Errorf("password=secret: %w", postdomain.ErrExpectedRevision), http.StatusBadRequest, "invalid request", "POST_EXPECTED_REVISION_REQUIRED"},
        {"unknown server error", errors.New("DSN secret password=secret"), http.StatusInternalServerError, "internal server error", ""},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            response := httptest.NewRecorder()
            ctx, _ := gin.CreateTestContext(response)
            ctx.Request = httptest.NewRequest(http.MethodPost, "/test", nil)
            ctx.Set("request_id", "test-request-id")
            WriteDomainError(ctx, tc.err)
            if response.Code != tc.status { t.Fatalf("status=%d, want=%d", response.Code, tc.status) }
            var payload map[string]any
            if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil { t.Fatal(err) }
            if msg, _ := payload["message"].(string); msg != tc.public {
                t.Fatalf("message=%q, want=%q", msg, tc.public)
            }
            if tc.code != "" && payload["error_code"] != tc.code { t.Fatalf("error_code=%v, want=%q", payload["error_code"], tc.code) }
            if strings.Contains(response.Body.String(), "secret") || strings.Contains(response.Body.String(), "/srv/private.sql") {
                t.Fatalf("internal detail leaked: %s", response.Body.String())
            }
        })
    }
}

func TestPublicDomainErrorMessageIsStable(t *testing.T) {
    for _, status := range []int{400, 404, 409, 500, 503} {
        if message := publicDomainErrorMessage(status); message == "" {
            t.Fatalf("empty public message for %d", status)
        }
    }
}
