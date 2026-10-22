package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

func TestRequestTimeoutDiscardsPanicBuffer(t *testing.T) {
	for _, mode := range []string{gin.ReleaseMode, gin.DebugMode} {
		t.Run(mode, func(t *testing.T) {
			defaultLog := recoveryTestDiagnostics(t, mode)
			core, logs := observer.New(zapcore.DebugLevel)
			engine := gin.New()
			engine.Use(func(c *gin.Context) {
				c.Set("logger", zap.New(core))
				c.Header("X-Boundary", "retained")
			}, RecoveryMiddleware(), TimeoutMiddleware(time.Second))
			engine.GET("/panic", func(c *gin.Context) {
				c.Header("X-Partial", "secret-cookie-value")
				c.String(http.StatusCreated, "secret-body-value")
				c.Writer.WriteHeaderNow()
				panic("secret-panic-value")
			})
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/panic", nil))
			want, _ := json.Marshal(gouno.NewInternalServerErrorResponse())
			if w.Code != 500 || w.Body.String() != string(want) || w.Header().Get("X-Partial") != "" || w.Header().Get("X-Boundary") != "retained" {
				t.Fatalf("panic buffer escaped or outer headers changed: status=%d body=%q headers=%v", w.Code, w.Body.String(), w.Header())
			}
			if logs.Len() != 1 {
				t.Fatalf("want one diagnostic, got %d", logs.Len())
			}
			trace, _ := logs.All()[0].ContextMap()["stack"].(string)
			if !strings.Contains(trace, "TestRequestTimeoutDiscardsPanicBuffer") {
				t.Error("worker panic frame was lost crossing goroutines")
			}
			assertRecoveryRedacted(t, defaultLog.String()+w.Body.String()+trace)
		})
	}
}

func TestRequestTimeoutLateCompletion(t *testing.T) {
	for _, mode := range []string{gin.ReleaseMode, gin.DebugMode} {
		for _, panics := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/panic=%t", mode, panics), func(t *testing.T) {
				defaultLog := recoveryTestDiagnostics(t, mode)
				core, logs := observer.New(zapcore.DebugLevel)
				engine := gin.New()
				var aborted bool
				var errorsText string
				engine.Use(func(c *gin.Context) {
					c.Set("logger", zap.New(core))
					c.Next()
					aborted, errorsText = c.IsAborted(), c.Errors.String()
				}, RecoveryMiddleware(), TimeoutMiddleware(10*time.Millisecond))
				engine.GET("/late", func(c *gin.Context) {
					c.Header("X-Partial", "secret-cookie-value")
					c.String(201, "secret-body-value")
					<-c.Request.Context().Done()
					if panics {
						panic("secret-panic-value")
					}
					c.Header("X-Late", "secret-api-key")
					c.String(202, "secret-body-value")
				})
				w := httptest.NewRecorder()
				engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/late", nil))
				want, _ := json.Marshal(gouno.NewRequestTimeoutResponse())
				if w.Code != http.StatusRequestTimeout || w.Body.String() != string(want) || !aborted {
					t.Errorf("timeout not terminal: status=%d body=%q aborted=%t", w.Code, w.Body.String(), aborted)
				}
				if w.Header().Get("X-Partial") != "" || w.Header().Get("X-Late") != "" {
					t.Error("timeout leaked worker headers")
				}
				wantLogs := 0
				if panics {
					wantLogs = 1
				}
				if logs.Len() != wantLogs {
					t.Errorf("want %d late-panic diagnostics, got %d", wantLogs, logs.Len())
				}
				encoded, _ := json.Marshal(logs.All())
				assertRecoveryRedacted(t, defaultLog.String()+errorsText+w.Body.String()+string(encoded))
			})
		}
	}
}

func TestRequestTimeoutJoinsWorkerBeforeReturning(t *testing.T) {
	recoveryTestDiagnostics(t, gin.ReleaseMode)
	engine := gin.New()
	engine.Use(RecoveryMiddleware(), TimeoutMiddleware(10*time.Millisecond))
	deadlineSeen, release, returned := make(chan struct{}), make(chan struct{}), make(chan struct{})
	engine.GET("/join", func(c *gin.Context) {
		<-c.Request.Context().Done()
		close(deadlineSeen)
		<-release
		c.Header("X-Late", "discarded")
		c.Writer.WriteHeaderNow()
		c.Writer.Flush()
		c.String(200, "late response")
	})
	w := httptest.NewRecorder()
	go func() {
		defer close(returned)
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/join", nil))
	}()
	select {
	case <-deadlineSeen:
	case <-time.After(time.Second):
		close(release)
		t.Fatal("request deadline did not reach the worker")
	}
	select {
	case <-returned:
		close(release)
		t.Fatal("Gin context returned while worker still owned it")
	default:
	}
	close(release)
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("request did not finish after worker exited")
	}
	want, _ := json.Marshal(gouno.NewRequestTimeoutResponse())
	if w.Code != 408 || w.Body.String() != string(want) || w.Header().Get("X-Late") != "" {
		t.Errorf("late writes changed the timeout: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
}

func TestRequestTimeoutConcurrentIsolation(t *testing.T) {
	recoveryTestDiagnostics(t, gin.ReleaseMode)
	engine := gin.New()
	engine.Use(RecoveryMiddleware(), TimeoutMiddlewareWithOverrides(time.Second, map[string]time.Duration{"/slow/:id": 10 * time.Millisecond}))
	engine.GET("/fast/:id", func(c *gin.Context) {
		c.Header("X-Result", c.Param("id"))
		c.String(http.StatusCreated, c.Param("id"))
	})
	engine.GET("/slow/:id", func(c *gin.Context) {
		c.Header("X-Result", "discarded")
		<-c.Request.Context().Done()
		c.String(http.StatusOK, "late response")
	})
	var wg sync.WaitGroup
	failures := make(chan string, 32)
	for i := range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			path := fmt.Sprintf("/fast/%d", i)
			if i%2 == 0 {
				path = fmt.Sprintf("/slow/%d", i)
			}
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
			if i%2 == 0 {
				want, _ := json.Marshal(gouno.NewRequestTimeoutResponse())
				if w.Code != 408 || w.Body.String() != string(want) || w.Header().Get("X-Result") != "" {
					failures <- fmt.Sprintf("late response escaped for %s", path)
				}
			} else if w.Code != 201 || w.Body.String() != fmt.Sprint(i) || w.Header().Get("X-Result") != fmt.Sprint(i) {
				failures <- fmt.Sprintf("success response changed for %s", path)
			}
		}()
	}
	wg.Wait()
	close(failures)
	for failure := range failures {
		t.Error(failure)
	}
}
