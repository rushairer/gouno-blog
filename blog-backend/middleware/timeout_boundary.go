package middleware

import (
	"bufio"
	"bytes"
	"context"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-contrib/timeout"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
)

// requestPanic carries a frame-only stack across the timeout worker boundary.
// Its value is never formatted or retained in Gin errors or diagnostics.
type requestPanic struct {
	value any
	stack zap.Field
}

// runRequestWithTimeout uses the pinned upstream buffered writer, but not
// timeout.New: that constructor renders raw panic values/stacks in Debug mode.
// Preserve cancellation, 408 envelopes, buffered success and worker joining.
// Like the existing timeout middleware, this is not a streaming transport and
// cannot forcibly stop handlers that ignore their request context.
func runRequestWithTimeout(c *gin.Context, deadline time.Duration) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), deadline)
	defer cancel()
	c.Request = c.Request.WithContext(requestContext)
	original := c.Writer
	buffer := new(bytes.Buffer)
	writer := &requestDeadlineWriter{
		Writer:          timeout.NewWriter(original, buffer),
		requestContext:  requestContext,
		originalHeaders: original.Header().Clone(),
	}
	c.Writer = writer
	defer func() { c.Writer = original }()

	finished := make(chan *requestPanic, 1)
	go func() {
		defer func() {
			if value := recover(); value != nil {
				finished <- &requestPanic{value: value, stack: zap.Stack("stack")}
			} else {
				finished <- nil
			}
		}()
		c.Next()
	}()

	timer := time.NewTimer(deadline)
	defer timer.Stop()
	select {
	case failure := <-finished:
		// Completion and deadline notifications can become ready together.
		// Never flush a late success merely because select chose completion.
		if requestContext.Err() == context.DeadlineExceeded {
			writer.expire()
			c.Abort()
			if failure != nil {
				recordRequestPanic(c, *failure)
			}
			return
		}
		if failure != nil {
			writer.discard()
			panic(*failure) // Only the mode-independent outer recovery owns 500s.
		}
		writer.flush(buffer)
	case <-timer.C:
		// Serialize expiration with all worker response writes, including Flush.
		// Headers belong to the worker's private map; never read it concurrently.
		writer.expire()
		// Do not copy, abort, restore or return the Gin context while its worker
		// still owns c.index. Join even after writing the timeout response.
		failure := <-finished
		c.Abort()
		if failure != nil {
			recordRequestPanic(c, *failure) // Keep the existing 408 response intact.
		}
	}
}

// The upstream writer already locks its body. This outer lock also serializes
// operations on its underlying Gin writer with the expiration response.
// Header() remains worker-owned until finished is received.
type requestDeadlineWriter struct {
	*timeout.Writer
	mu              sync.Mutex
	closed          bool
	requestContext  context.Context
	originalHeaders http.Header
}

func (w *requestDeadlineWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.unavailable() {
		return 0, nil
	}
	return w.Writer.Write(data)
}

func (w *requestDeadlineWriter) WriteString(value string) (int, error) {
	return w.Write([]byte(value))
}

func (w *requestDeadlineWriter) WriteHeader(code int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.unavailable() {
		w.Writer.WriteHeader(code)
	}
}

func (w *requestDeadlineWriter) WriteHeaderNow() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.unavailable() {
		w.Writer.WriteHeaderNow()
	}
}

func (w *requestDeadlineWriter) Flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.unavailable() {
		w.Writer.Flush()
	}
}

func (w *requestDeadlineWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.unavailable() {
		return nil, nil, http.ErrHandlerTimeout
	}
	return w.Writer.Hijack()
}

func (w *requestDeadlineWriter) Status() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.unavailable() {
		return w.Writer.ResponseWriter.Status()
	}
	return w.Writer.Status()
}

func (w *requestDeadlineWriter) Size() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.Writer.Size()
}

func (w *requestDeadlineWriter) Written() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.Writer.Written()
}

func (w *requestDeadlineWriter) discard() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.closed {
		w.closed = true
		w.Writer.FreeBuffer()
		w.restoreUncommittedHeaders()
	}
}

func (w *requestDeadlineWriter) expire() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.closed = true
	w.Writer.FreeBuffer()
	original := w.Writer.ResponseWriter
	if !original.Written() {
		w.restoreUncommittedHeaders()
		original.WriteHeader(http.StatusRequestTimeout)
		_ = (render.JSON{Data: gouno.NewRequestTimeoutResponse()}).Render(original)
	}
}

func (w *requestDeadlineWriter) flush(buffer *bytes.Buffer) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.closed = true
	defer w.Writer.FreeBuffer()
	original := w.Writer.ResponseWriter
	for name, values := range w.Writer.Header() {
		original.Header()[name] = values
	}
	original.WriteHeader(w.Writer.Status())
	if buffer.Len() > 0 {
		if _, err := original.Write(buffer.Bytes()); err != nil {
			panic(err)
		}
	}
}

// Call with mu held. The request deadline can fire before the controller's
// timer case runs; worker Flush/WriteHeaderNow must not bypass that deadline.
func (w *requestDeadlineWriter) unavailable() bool {
	return w.closed || w.requestContext.Err() == context.DeadlineExceeded
}

// Upstream WriteHeaderNow can copy worker headers without committing bytes.
// Only restore while uncommitted; already-sent headers cannot be recalled.
func (w *requestDeadlineWriter) restoreUncommittedHeaders() {
	if w.Writer.ResponseWriter.Written() {
		return
	}
	destination := w.Writer.ResponseWriter.Header()
	clear(destination)
	for name, values := range w.originalHeaders {
		destination[name] = values
	}
}
