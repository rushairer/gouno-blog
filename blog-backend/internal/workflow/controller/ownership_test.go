package controller

import (
	"os"
	"strings"
	"testing"
)

func TestWorkflowControllerDoesNotDependOnFlatController(t *testing.T) {
	data, err := os.ReadFile("controller.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "internal/controller\"") {
		t.Fatal("Workflow capability controller must use controllerutil rather than the flat controller package")
	}
}

func TestWebhookSecretContract(t *testing.T) {
	if ValidWebhookSecret("short") {
		t.Fatal("short webhook secret accepted")
	}
	if !ValidWebhookSecret(strings.Repeat("x", 32)) {
		t.Fatal("32-byte webhook secret rejected")
	}
}
