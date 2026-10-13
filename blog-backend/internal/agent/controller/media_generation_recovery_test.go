package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// Route payload checks must reject malformed/missing incident references and
// attestations before any approval service or generation port is invoked.
func TestManualRecoveryRequestRejectsUnconfirmedOrMalformedEvidence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	router := gin.New()
	router.POST("/manual-recovery/:id", ctrl.ReleaseUncertainImageTask)
	for _, tc := range []struct {
		name, body string
	}{
		{"not-json", `{"expected_generation_attempt":`},
		{"missing-attempt", `{"evidence_reference":"INC-20261013-0001","verified_provider_outcome":true,"verified_object_storage":true,"acknowledged_possible_billing":true}`},
		{"no-provider-check", `{"expected_generation_attempt":1,"evidence_reference":"INC-20261013-0001","verified_provider_outcome":false,"verified_object_storage":true,"acknowledged_possible_billing":true}`},
		{"no-storage-check", `{"expected_generation_attempt":1,"evidence_reference":"INC-20261013-0001","verified_provider_outcome":true,"verified_object_storage":false,"acknowledged_possible_billing":true}`},
		{"no-billing-ack", `{"expected_generation_attempt":1,"evidence_reference":"INC-20261013-0001","verified_provider_outcome":true,"verified_object_storage":true,"acknowledged_possible_billing":false}`},
		{"no-reference", `{"expected_generation_attempt":1,"verified_provider_outcome":true,"verified_object_storage":true,"acknowledged_possible_billing":true}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/manual-recovery/42", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "invalid manual recovery evidence") {
				t.Fatalf("unsafe manual recovery accepted or changed its error: HTTP %d body=%s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "binding") || strings.Contains(rec.Body.String(), "field validation") {
				t.Fatal("internal validator details disclosed")
			}
		})
	}
}

func TestManualRecoveryRequiresLocalReviewerEvenAfterValidEvidence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	router := gin.New()
	router.POST("/manual-recovery/:id", ctrl.ReleaseUncertainImageTask)
	body := `{"expected_generation_attempt":1,"evidence_reference":"INC-20261013-0001","verified_provider_outcome":true,"verified_object_storage":true,"acknowledged_possible_billing":true}`
	req := httptest.NewRequest(http.MethodPost, "/manual-recovery/42", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("manual recovery accepted absent local principal: HTTP %d body=%s", rec.Code, rec.Body.String())
	}
}
