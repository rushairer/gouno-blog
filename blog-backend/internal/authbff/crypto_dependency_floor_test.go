package authbff

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// checkDependencyFloor uses the checked-in go.mod as the explicit minimum
// version contract. The Go module resolver may choose a newer compatible
// version, but it must not silently accept a lower direct requirement.
func checkDependencyFloor(goMod, module, minimum string) error {
	minimumParts, err := parseDependencyVersion(minimum)
	if err != nil {
		return fmt.Errorf("invalid minimum %s for %s: %w", minimum, module, err)
	}
	var version string
	matches := 0
	for _, line := range strings.Split(goMod, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != module {
			continue
		}
		matches++
		version = fields[1]
	}
	if matches != 1 {
		return fmt.Errorf("%s must have exactly one declared version (found %d)", module, matches)
	}
	actualParts, err := parseDependencyVersion(version)
	if err != nil {
		return fmt.Errorf("%s has unsupported version %q: %w", module, version, err)
	}
	for i := 0; i < 3; i++ {
		if actualParts[i] > minimumParts[i] {
			return nil
		}
		if actualParts[i] < minimumParts[i] {
			return fmt.Errorf("%s requirement %s is below security floor %s", module, version, minimum)
		}
	}
	return nil
}

func parseDependencyVersion(version string) ([3]int, error) {
	var values [3]int
	if !strings.HasPrefix(version, "v") {
		return values, fmt.Errorf("not a canonical v-prefixed version: %q", version)
	}
	parts := strings.Split(strings.TrimPrefix(version, "v"), ".")
	if len(parts) != 3 {
		return values, fmt.Errorf("expected three release components in %q", version)
	}
	for i, part := range parts {
		if part == "" || strings.Trim(part, "0123456789") != "" {
			return values, fmt.Errorf("non-integer release component in %q", version)
		}
		value, err := strconv.Atoi(part)
		if err != nil {
			return values, fmt.Errorf("invalid release component in %q: %w", version, err)
		}
		values[i] = value
	}
	return values, nil
}

func TestBFFCryptographicDependencyFloors(t *testing.T) {
	goMod, err := os.ReadFile(filepath.Join("..", "..", "go.mod"))
	if err != nil {
		t.Fatalf("read backend go.mod: %v", err)
	}
	for _, dependency := range []struct {
		module string
		floor  string
	}{
		{"github.com/go-jose/go-jose/v4", "v4.1.6"},
		{"github.com/tink-crypto/tink-go/v2", "v2.9.0"},
	} {
		t.Run(dependency.module, func(t *testing.T) {
			if err := checkDependencyFloor(string(goMod), dependency.module, dependency.floor); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestBFFCryptographicDependencyFloorCannotFalseGreen(t *testing.T) {
	const module = "github.com/go-jose/go-jose/v4"
	const minimum = "v4.1.6"
	tests := []struct {
		name      string
		goMod     string
		shouldErr bool
	}{
		{"exact floor", module + " v4.1.6 // indirect", false},
		{"newer patch", module + " v4.1.8 // indirect", false},
		{"newer minor", module + " v4.2.0 // indirect", false},
		{"stale Dependabot version", module + " v4.1.4 // indirect", true},
		{"prior major", module + " v3.99.99 // indirect", true},
		{"missing requirement", "module github.com/rushairer/blog-backend", true},
		{"duplicate requirement", module + " v4.1.6\n" + module + " v4.1.7", true},
		{"malformed version", module + " v4.1.6-pre", true},
		{"nonrelease notation", module + " main", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkDependencyFloor(tc.goMod, module, minimum)
			if (err != nil) != tc.shouldErr {
				t.Fatalf("checkDependencyFloor error = %v, want error = %v", err, tc.shouldErr)
			}
		})
	}
}
