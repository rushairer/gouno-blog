package domain

import "testing"

func TestDefaultVendorPreservesLegacyProviderTypes(t *testing.T) {
	tests := []struct {
		providerType ProviderType
		want         ProviderVendor
	}{
		{ProviderOpenAI, VendorOpenAI},
		{ProviderAnthropic, VendorAnthropic},
		{ProviderGemini, VendorGoogle},
	}
	for _, test := range tests {
		if got := DefaultVendor(test.providerType); got != test.want {
			t.Fatalf("DefaultVendor(%q) = %q, want %q", test.providerType, got, test.want)
		}
	}
}

func TestSupportedProviderVendorCatalog(t *testing.T) {
	for _, vendor := range []ProviderVendor{
		VendorOpenAI,
		VendorAnthropic,
		VendorGoogle,
		VendorDeepSeek,
		VendorAlibaba,
		VendorVolcengine,
		VendorMoonshot,
		VendorTencent,
		VendorZhipu,
		VendorBaidu,
		VendorMiniMax,
		VendorXAI,
		VendorMistral,
		VendorCustom,
	} {
		if !IsSupportedVendor(vendor) {
			t.Fatalf("expected vendor %q to be supported", vendor)
		}
	}
	if IsSupportedVendor(ProviderVendor("unknown-vendor")) {
		t.Fatal("unexpected support for unknown vendor")
	}
}
