package access_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
)

func TestRecentMFA_TableDriven(t *testing.T) {
	now := time.Unix(1724774400, 0) // Fixed reference time

	tests := []struct {
		name     string
		claims   jwt.MapClaims
		expected bool
	}{
		{
			name: "valid current auth with otp",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Unix()),
				"amr":       []interface{}{"pwd", "otp"},
			},
			expected: true,
		},
		{
			name: "valid auth 5 minutes ago with totp",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(-5 * time.Minute).Unix()),
				"amr":       []interface{}{"totp"},
			},
			expected: true,
		},
		{
			name: "valid auth with json.Number",
			claims: jwt.MapClaims{
				"auth_time": json.Number("1724774400"),
				"amr":       []interface{}{"mfa"},
			},
			expected: true,
		},
		{
			name: "valid auth with int64",
			claims: jwt.MapClaims{
				"auth_time": now.Unix(),
				"amr":       []interface{}{"swk"},
			},
			expected: true,
		},
		{
			name: "valid auth exactly at 10m boundary",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(-10 * time.Minute).Unix()),
				"amr":       []interface{}{"otp"},
			},
			expected: true,
		},
		{
			name: "expired auth over 10m boundary (10m 1s)",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(-10*time.Minute - time.Second).Unix()),
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "acceptable small future clock skew (30s)",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(30 * time.Second).Unix()),
				"amr":       []interface{}{"otp"},
			},
			expected: true,
		},
		{
			name: "reject future auth exceeding allowed skew (120s)",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(120 * time.Second).Unix()),
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject distant future auth (1 day)",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Add(24 * time.Hour).Unix()),
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject zero auth_time",
			claims: jwt.MapClaims{
				"auth_time": float64(0),
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject negative auth_time",
			claims: jwt.MapClaims{
				"auth_time": float64(-100),
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject missing auth_time",
			claims: jwt.MapClaims{
				"amr": []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject string non-numeric auth_time",
			claims: jwt.MapClaims{
				"auth_time": "invalid",
				"amr":       []interface{}{"otp"},
			},
			expected: false,
		},
		{
			name: "reject missing amr",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Unix()),
			},
			expected: false,
		},
		{
			name: "reject unsupported amr (pwd only)",
			claims: jwt.MapClaims{
				"auth_time": float64(now.Unix()),
				"amr":       []interface{}{"pwd"},
			},
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := access.RecentMFA(tc.claims, now)
			if got != tc.expected {
				t.Errorf("RecentMFA: expected %v, got %v", tc.expected, got)
			}
		})
	}
}
