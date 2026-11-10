package controller

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Invalid requests must stop before persistence, OAuth dispatch, external reads
// or outbox mutations. No service is installed, so dispatch would fail the test.
func TestConnectorJSONErrorsAreRedactedBeforeServiceDispatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	const privateField = "PRIVATE_CONNECTOR_CREDENTIAL_NEVER_RETURN"
	const bodyLimit = 2 << 20
	for _, route := range []struct {
		name    string
		handler func(*gin.Context)
		badType string
	}{
		{"save_profile", ctrl.SaveConnectorProfile, `{"credential":[]}`},
		{"complete_oauth", ctrl.CompleteConnectorOAuth, `{"code":[]}`},
		{"search_console_summary", ctrl.SearchConsoleSummary, `{"start_date":[]}`},
		{"queue_outbox", ctrl.QueueConnectorOutbox, `{"connector_profile_id":[]}`},
	} {
		for _, input := range []struct {
			name   string
			body   string
			status int
			text   string
		}{
			{"unknown_private_field", `{"` + privateField + `":"confidential-value"}`, http.StatusBadRequest, "invalid request body"},
			{"malformed", `{"`, http.StatusBadRequest, "invalid request body"},
			{"wrong_type", route.badType, http.StatusBadRequest, "invalid request body"},
			{"second_object", `{} {}`, http.StatusBadRequest, "invalid request body"},
			{"trailing_malformed_json", `{} {`, http.StatusBadRequest, "invalid request body"},
			{"oversized_value", `{"` + privateField + `":"` + strings.Repeat("x", bodyLimit) + `"}`, http.StatusRequestEntityTooLarge, "request body too large"},
			{"oversized_trailing_whitespace", `{}` + strings.Repeat(" ", bodyLimit), http.StatusRequestEntityTooLarge, "request body too large"},
		} {
			t.Run(route.name+"/"+input.name, func(t *testing.T) {
				rec := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(rec)
				c.Params = gin.Params{{Key: "id", Value: "1"}}
				c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/connectors/"+route.name, strings.NewReader(input.body))
				c.Request.ContentLength = -1
				c.Request.Body = http.MaxBytesReader(rec, c.Request.Body, bodyLimit)
				route.handler(c)
				if rec.Code != input.status || !c.IsAborted() {
					t.Fatalf("request did not stop at safe binding boundary: status=%d body=%s", rec.Code, rec.Body.String())
				}
				var body struct {
					Message string `json:"message"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Message != input.text {
					t.Fatalf("unexpected safe response: %s (decode=%v)", rec.Body.String(), err)
				}
				for _, sensitive := range []string{privateField, "confidential-value", "unknown field", "cannot unmarshal", "unexpected EOF"} {
					if strings.Contains(rec.Body.String(), sensitive) {
						t.Fatalf("response disclosed decoder/request detail %q: %s", sensitive, rec.Body.String())
					}
				}
			})
		}
	}
}

func TestConnectorBindingPreservesValidSingleObjectRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, body := range []string{`{}`, `{"code":"value"}`, "{\"code\":\"编码\"}\n\t  "} {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		c.Request.Body = http.MaxBytesReader(rec, c.Request.Body, 2<<20)
		var req struct {
			Code string `json:"code"`
		}
		if err := bindAgentJSON(c, &req); err != nil {
			t.Fatalf("valid single object rejected: %v", err)
		}
	}
}
