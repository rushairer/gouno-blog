package gouno

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rushairer/gouno/generator"
)

func TestProjectCodegenGeneratesCapabilityModule(t *testing.T) {
	projectRoot := t.TempDir()
	copyCodegenRuntime(t, projectRoot)

	cmd, err := generator.LoadProjectCommand(projectRoot)
	if err != nil {
		t.Fatalf("load project Codegen command: %v", err)
	}
	if cmd == nil {
		t.Fatal("expected project Codegen command")
	}
	if cmd.Name() != "gen" {
		t.Fatalf("command name = %q, want gen", cmd.Name())
	}

	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetErr(&output)
	cmd.SetArgs([]string{"module", "smoke_feature"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute module generator: %v\n%s", err, output.String())
	}

	files := []string{
		"internal/smoke_feature/domain/smoke_feature.go",
		"internal/smoke_feature/repository/smoke_feature_repository.go",
		"internal/smoke_feature/service/smoke_feature_service.go",
		"internal/smoke_feature/controller/smoke_feature_controller.go",
	}
	for _, rel := range files {
		data, err := os.ReadFile(filepath.Join(projectRoot, rel))
		if err != nil {
			t.Fatalf("read generated %s: %v", rel, err)
		}
		if !strings.Contains(string(data), "SmokeFeature") {
			t.Fatalf("generated %s does not contain SmokeFeature:\n%s", rel, data)
		}
	}
}

func copyCodegenRuntime(t *testing.T, projectRoot string) {
	t.Helper()

	sourceRoot := filepath.Join("..", "..", ".gouno")
	destinationRoot := filepath.Join(projectRoot, ".gouno")
	if err := os.MkdirAll(filepath.Join(destinationRoot, "codegen"), 0o755); err != nil {
		t.Fatalf("create temporary Codegen directory: %v", err)
	}

	files := []string{
		"codegen.yaml",
		"codegen/module-domain.tmpl",
		"codegen/module-repository.tmpl",
		"codegen/module-service.tmpl",
		"codegen/module-controller.tmpl",
	}
	for _, rel := range files {
		data, err := os.ReadFile(filepath.Join(sourceRoot, rel))
		if err != nil {
			t.Fatalf("read Codegen runtime %s: %v", rel, err)
		}
		destination := filepath.Join(destinationRoot, rel)
		if err := os.WriteFile(destination, data, 0o644); err != nil {
			t.Fatalf("write Codegen runtime %s: %v", rel, err)
		}
	}
}
