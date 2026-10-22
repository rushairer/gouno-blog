package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

// These tests mutate Gin's process-global diagnostics and must not run in parallel.
func recoveryTestDiagnostics(t *testing.T, mode string) *bytes.Buffer {
	t.Helper()
	oldMode, oldWriter, oldErrorWriter := gin.Mode(), gin.DefaultWriter, gin.DefaultErrorWriter
	var output bytes.Buffer
	gin.SetMode(mode)
	gin.DefaultWriter = io.Discard
	gin.DefaultErrorWriter = &output
	t.Cleanup(func() {
		gin.SetMode(oldMode)
		gin.DefaultWriter, gin.DefaultErrorWriter = oldWriter, oldErrorWriter
	})
	return &output
}

type recoveryStringer struct{ value string }

func (v recoveryStringer) String() string { return v.value }

type recoveryHostileError struct{}

func (recoveryHostileError) Error() string { panic("secret-error-format") }
func (recoveryHostileError) Is(error) bool { panic("secret-error-classification") }

type recoveryHostileUnwrap struct{}

func (recoveryHostileUnwrap) Error() string { panic("secret-unwrap-format") }
func (recoveryHostileUnwrap) Unwrap() error { panic("secret-unwrap-classification") }

type recoveryHostileStringer struct{}

func (recoveryHostileStringer) String() string { panic("secret-stringer-format") }

func assertRecoveryRedacted(t *testing.T, output string) {
	t.Helper()
	for _, secret := range []string{
		"secret-panic-value", "secret-path-value", "secret-query-code", "secret-query-state",
		"secret-cookie-value", "secret-authorization-value", "secret-api-key", "secret-body-value",
		"secret-error-format", "secret-error-classification", "secret-unwrap-format",
		"secret-unwrap-classification", "secret-stringer-format", "secret-request-id",
	} {
		if strings.Contains(output, secret) {
			t.Errorf("recovery exposed synthetic marker %q", secret)
		}
	}
}

func TestRecoverySecurityBoundary(t *testing.T) {
	values := []struct {
		name  string
		value any
	}{
		{"string", "secret-panic-value"},
		{"error", errors.New("secret-panic-value")},
		{"stringer", recoveryStringer{"secret-panic-value"}},
		{"nil", nil},
		{"hostile-error", recoveryHostileError{}},
		{"hostile-unwrap", recoveryHostileUnwrap{}},
		{"hostile-stringer", recoveryHostileStringer{}},
	}
	for _, mode := range []string{gin.ReleaseMode, gin.DebugMode} {
		for _, withTimeout := range []bool{false, true} {
			for _, tc := range values {
				t.Run(fmt.Sprintf("%s/timeout=%t/%s", mode, withTimeout, tc.name), func(t *testing.T) {
					defaultLog := recoveryTestDiagnostics(t, mode)
					core, logs := observer.New(zapcore.DebugLevel)
					logger := zap.New(core)
					engine := gin.New()
					var contextErrors string
					var aborted, reachedNext bool
					engine.Use(func(c *gin.Context) {
						c.Set("logger", logger)
						c.Set("request_id", "secret-request-id")
						c.Next()
						contextErrors = c.Errors.String()
						aborted = c.IsAborted()
					}, RecoveryMiddleware())
					if withTimeout {
						engine.Use(TimeoutMiddleware(time.Second))
					}
					engine.POST("/panic/:id", func(c *gin.Context) { panic(tc.value) }, func(c *gin.Context) {
						reachedNext = true
					})
					req := httptest.NewRequest(http.MethodPost, "/panic/secret-path-value?code=secret-query-code&state=secret-query-state", strings.NewReader("secret-body-value"))
					req.Header.Set("Cookie", "__Host-blog-session=secret-cookie-value")
					req.Header.Set("Authorization", "Bearer secret-authorization-value")
					req.Header.Set("X-Api-Key", "secret-api-key")
					recorder := httptest.NewRecorder()
					engine.ServeHTTP(recorder, req)

					want, err := json.Marshal(gouno.NewInternalServerErrorResponse())
					if err != nil {
						t.Fatal(err)
					}
					if recorder.Code != http.StatusInternalServerError || recorder.Body.String() != string(want) {
						t.Errorf("unexpected panic response: status=%d body=%q", recorder.Code, recorder.Body.String())
					}
					if !aborted || reachedNext {
						t.Errorf("panic did not terminate the chain: aborted=%t reachedNext=%t", aborted, reachedNext)
					}
					assertRecoveryRedacted(t, recorder.Body.String()+contextErrors+defaultLog.String())
					entries := logs.All()
					if len(entries) != 1 {
						t.Fatalf("want one structured diagnostic, got %d", len(entries))
					}
					entry := entries[0]
					fields := entry.ContextMap()
					encoded, err := json.Marshal(fields)
					if err != nil {
						t.Fatal(err)
					}
					assertRecoveryRedacted(t, entry.Message+string(encoded))
					if entry.Level != zapcore.ErrorLevel || fields["route"] != "/panic/:id" {
						t.Errorf("missing safe route/error diagnostic: %+v", entry)
					}
					if stack, ok := fields["stack"].(string); !ok || stack == "" {
						t.Error("panic diagnostic lost frame-only stack")
					}
				})
			}
		}
	}
}

type recoveryWriteRecorder struct {
	*httptest.ResponseRecorder
	writes int
}

func (w *recoveryWriteRecorder) WriteHeader(code int) {
	w.writes++
	w.ResponseRecorder.WriteHeader(code)
}

func (w *recoveryWriteRecorder) Write(data []byte) (int, error) {
	w.writes++
	return w.ResponseRecorder.Write(data)
}

func TestRecoveryDisconnectedRequest(t *testing.T) {
	for _, mode := range []string{gin.ReleaseMode, gin.DebugMode} {
		for _, tc := range []struct {
			name  string
			value error
		}{
			{"pipe", syscall.EPIPE},
			{"wrapped-pipe", fmt.Errorf("secret-panic-value: %w", syscall.EPIPE)},
			{"reset", syscall.ECONNRESET},
			{"wrapped-reset", fmt.Errorf("secret-panic-value: %w", syscall.ECONNRESET)},
			{"abort", http.ErrAbortHandler},
			{"joined-abort", errors.Join(errors.New("secret-panic-value"), http.ErrAbortHandler)},
		} {
			t.Run(mode+"/"+tc.name, func(t *testing.T) {
				defaultLog := recoveryTestDiagnostics(t, mode)
				core, logs := observer.New(zapcore.DebugLevel)
				engine := gin.New()
				var contextErrors string
				var aborted, reachedNext bool
				engine.Use(func(c *gin.Context) {
					c.Set("logger", zap.New(core))
					c.Next()
					contextErrors, aborted = c.Errors.String(), c.IsAborted()
				}, RecoveryMiddleware())
				engine.GET("/panic/:id", func(c *gin.Context) { panic(tc.value) }, func(c *gin.Context) { reachedNext = true })
				req := httptest.NewRequest(http.MethodGet, "/panic/secret-path-value?code=secret-query-code", nil)
				req.Header.Set("Cookie", "session=secret-cookie-value")
				w := &recoveryWriteRecorder{ResponseRecorder: httptest.NewRecorder()}
				engine.ServeHTTP(w, req)
				if w.writes != 0 || w.Body.Len() != 0 || !aborted || reachedNext {
					t.Errorf("disconnected request was written to or continued: writes=%d aborted=%t next=%t", w.writes, aborted, reachedNext)
				}
				assertRecoveryRedacted(t, contextErrors+defaultLog.String()+w.Body.String())
				entries := logs.All()
				if len(entries) != 1 || entries[0].Level != zapcore.WarnLevel {
					t.Fatalf("want one disconnect warning, got %+v", entries)
				}
				fields := entries[0].ContextMap()
				if _, exists := fields["stack"]; exists {
					t.Error("disconnect should not produce a panic stack")
				}
				data, _ := json.Marshal(fields)
				assertRecoveryRedacted(t, entries[0].Message+string(data))
			})
		}
	}
}

func TestRecoveryGlobalLoggerAndUnknownRoute(t *testing.T) {
	for _, value := range []any{nil, (*zap.Logger)(nil), "not-a-logger"} {
		t.Run(fmt.Sprintf("%T", value), func(t *testing.T) {
			defaultLog := recoveryTestDiagnostics(t, gin.ReleaseMode)
			core, logs := observer.New(zapcore.DebugLevel)
			restore := zap.ReplaceGlobals(zap.New(core))
			t.Cleanup(restore)
			engine := gin.New()
			engine.Use(func(c *gin.Context) {
				if value != nil {
					c.Set("logger", value)
				}
			}, RecoveryMiddleware())
			engine.NoRoute(func(c *gin.Context) { panic("secret-panic-value") })
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/secret-path-value?state=secret-query-state", nil))
			if w.Code != http.StatusInternalServerError || logs.Len() != 1 {
				t.Fatalf("missing fallback logger or recovery: status=%d logs=%d", w.Code, logs.Len())
			}
			fields := logs.All()[0].ContextMap()
			if fields["route"] != "" {
				t.Error("unmatched route must not fall back to user-controlled URL")
			}
			data, _ := json.Marshal(fields)
			assertRecoveryRedacted(t, string(data)+defaultLog.String()+w.Body.String())
		})
	}
}

func TestRecoveryPreservesSuccessfulRequests(t *testing.T) {
	for _, withTimeout := range []bool{false, true} {
		t.Run(fmt.Sprint(withTimeout), func(t *testing.T) {
			recoveryTestDiagnostics(t, gin.ReleaseMode)
			core, logs := observer.New(zapcore.DebugLevel)
			engine := gin.New()
			var contextErrorCount int
			engine.Use(func(c *gin.Context) {
				c.Set("logger", zap.New(core))
				c.Next()
				contextErrorCount = len(c.Errors)
			}, RecoveryMiddleware())
			if withTimeout {
				engine.Use(TimeoutMiddleware(time.Second))
			}
			engine.GET("/healthy", func(c *gin.Context) { c.Status(http.StatusNoContent) })
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/healthy", nil))
			if w.Code != http.StatusNoContent || w.Body.Len() != 0 || contextErrorCount != 0 || logs.Len() != 0 {
				t.Errorf("successful request changed: status=%d errors=%d logs=%d", w.Code, contextErrorCount, logs.Len())
			}
		})
	}
}

func TestRecoveryCommittedResponseAbortsTransport(t *testing.T) {
	defaultLog := recoveryTestDiagnostics(t, gin.ReleaseMode)
	core, logs := observer.New(zapcore.DebugLevel)
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("logger", zap.New(core)) }, RecoveryMiddleware())
	engine.GET("/partial", func(c *gin.Context) {
		c.String(http.StatusOK, "partial")
		c.Writer.Flush()
		panic("secret-panic-value")
	})
	var serverLog bytes.Buffer
	server := httptest.NewUnstartedServer(engine)
	server.Config.ErrorLog = log.New(&serverLog, "", 0)
	server.Start()
	defer server.Close()
	client := server.Client()
	client.Timeout = 2 * time.Second
	response, requestErr := client.Get(server.URL + "/partial")
	if requestErr == nil {
		defer response.Body.Close()
		body, readErr := io.ReadAll(response.Body)
		if readErr == nil {
			t.Error("partially committed panic response incorrectly completed successfully")
		}
		if string(body) != "partial" {
			t.Errorf("must not append an error envelope after committed bytes: %q", body)
		}
	}
	server.Close()
	if logs.Len() != 1 {
		t.Errorf("want one panic diagnostic, got %d", logs.Len())
	}
	assertRecoveryRedacted(t, defaultLog.String()+serverLog.String())
	if serverLog.Len() != 0 {
		t.Errorf("net/http should suppress the safe abort sentinel: %q", serverLog.String())
	}
}
