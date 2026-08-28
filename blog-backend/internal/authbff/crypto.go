package authbff

import (
	"os"

	"github.com/tink-crypto/tink-go/v2/aead"
	"github.com/tink-crypto/tink-go/v2/insecurecleartextkeyset"
	"github.com/tink-crypto/tink-go/v2/keyset"
	"github.com/tink-crypto/tink-go/v2/tink"
)

// LoadAEAD loads an application keyset mounted as a runtime secret. Token
// encryption is delegated to Google Tink rather than an application-defined
// cryptographic format. Production should wrap the keyset with a KMS when one
// is available; the initial Podman deployment mounts it read-only with 0600
// host permissions.
func LoadAEAD(path string) (tink.AEAD, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	handle, err := insecurecleartextkeyset.Read(keyset.NewJSONReader(f))
	if err != nil {
		return nil, err
	}
	return aead.New(handle)
}
