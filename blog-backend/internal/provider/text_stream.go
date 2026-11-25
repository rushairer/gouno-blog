package provider

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

var (
	ErrTextStreamIncomplete = errors.New("provider text stream ended without confirmed completion")
	ErrTextStreamInvalid    = errors.New("provider text stream contained invalid data")
	ErrTextStreamRejected   = errors.New("provider text stream reported a failed response")
)

const maxTextSSEEventBytes = 16 * 1024 * 1024

// consumeTextSSE implements data-line framing for text SSE only. Blank lines
// delimit events; multiple data lines are joined with a newline. Never ignore
// malformed or truncated data, and never treat [DONE] as model completion.
// The protocol decoder separately verifies its actual terminal signal.
func consumeTextSSE(body io.Reader, consume func(string) error) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), maxTextSSEEventBytes)
	var event strings.Builder
	hasData := false
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if !hasData {
				continue
			}
			data := strings.TrimSpace(event.String())
			event.Reset()
			hasData = false
			if data == "[DONE]" {
				return nil
			}
			if data != "" {
				if err := consume(data); err != nil {
					return err
				}
			}
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue // comments and other SSE fields do not contain JSON data
		}
		data := strings.TrimPrefix(line, "data:")
		data = strings.TrimPrefix(data, " ")
		if event.Len()+len(data)+1 > maxTextSSEEventBytes {
			return ErrTextStreamInvalid
		}
		if hasData {
			event.WriteByte('\n')
		}
		event.WriteString(data)
		hasData = true
	}
	if scanner.Err() != nil || hasData {
		return ErrTextStreamIncomplete
	}
	return nil
}

func validStreamToolCall(id, name string, arguments json.RawMessage) bool {
	if strings.TrimSpace(id) == "" || strings.TrimSpace(name) == "" {
		return false
	}
	// Missing/truncated arguments are not silently rewritten as an empty
	// object: that can execute a mutation with unintended default values.
	var object map[string]json.RawMessage
	return json.Unmarshal(arguments, &object) == nil && object != nil
}

func uniqueStreamToolIDs(calls []ToolCall) bool {
	seen := make(map[string]struct{}, len(calls))
	for _, call := range calls {
		if _, ok := seen[call.ID]; ok {
			return false
		}
		seen[call.ID] = struct{}{}
	}
	return true
}
