package config

import "testing"

func TestResolveSecureCookies(t *testing.T) {
	falseValue := false
	trueValue := true
	for _, test := range []struct {
		name   string
		config WebServerConfig
		env    string
		want   bool
	}{
		{name: "development defaults false", env: "development", want: false},
		{name: "development can opt in", config: WebServerConfig{SecureCookies: &trueValue}, env: "development", want: true},
		{name: "production forces secure", config: WebServerConfig{SecureCookies: &falseValue}, env: "production", want: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := test.config.ResolveSecureCookies(test.env); got != test.want {
				t.Fatalf("ResolveSecureCookies(%q) = %v, want %v", test.env, got, test.want)
			}
		})
	}
}
