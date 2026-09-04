package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

const KeyVersion = 1

const providerAPIKeyAADPrefix = "gouno:ai-provider-api-key:v1:"

type Box struct {
	currentVersion int
	keys           map[int]cipher.AEAD
}

func New(encodedKey string) (*Box, error) {
	return NewKeyring(encodedKey, "", "")
}

func NewKeyring(encodedKey, encodedVersion, previousKeys string) (*Box, error) {
	if encodedKey == "" {
		return nil, errors.New("BLOG_AGENT_MASTER_KEY is required")
	}
	currentVersion := KeyVersion
	var err error
	if strings.TrimSpace(encodedVersion) != "" {
		currentVersion, err = strconv.Atoi(strings.TrimSpace(encodedVersion))
		if err != nil || currentVersion < 1 {
			return nil, errors.New("BLOG_AGENT_MASTER_KEY_VERSION must be a positive integer")
		}
	}
	current, err := decodeKey("BLOG_AGENT_MASTER_KEY", encodedKey)
	if err != nil {
		return nil, err
	}
	keys := map[int]cipher.AEAD{currentVersion: current}
	for _, entry := range strings.Split(previousKeys, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.SplitN(entry, ":", 2)
		if len(parts) != 2 {
			return nil, errors.New("BLOG_AGENT_PREVIOUS_MASTER_KEYS must use version:base64key entries")
		}
		version, parseErr := strconv.Atoi(strings.TrimSpace(parts[0]))
		if parseErr != nil || version < 1 || version == currentVersion {
			return nil, errors.New("BLOG_AGENT_PREVIOUS_MASTER_KEYS contains an invalid version")
		}
		aead, decodeErr := decodeKey("BLOG_AGENT_PREVIOUS_MASTER_KEYS", strings.TrimSpace(parts[1]))
		if decodeErr != nil {
			return nil, decodeErr
		}
		if _, exists := keys[version]; exists {
			return nil, errors.New("BLOG_AGENT_PREVIOUS_MASTER_KEYS contains a duplicate version")
		}
		keys[version] = aead
	}
	return &Box{currentVersion: currentVersion, keys: keys}, nil
}

func decodeKey(label, encodedKey string) (cipher.AEAD, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", label, err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("%s must be base64 for exactly 32 bytes", label)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (b *Box) KeyVersion() int {
	return b.currentVersion
}

// ProviderAPIKeyAAD returns immutable associated data for a Provider API key.
// The domain separator prevents reuse across secret types; Provider ID and key
// version bind the ciphertext to one database record and one keyring version.
func ProviderAPIKeyAAD(providerID int64, keyVersion int) []byte {
	if providerID <= 0 || keyVersion <= 0 {
		return nil
	}
	return []byte(providerAPIKeyAADPrefix + strconv.FormatInt(providerID, 10) + ":" + strconv.Itoa(keyVersion))
}

func (b *Box) Encrypt(plaintext string) (ciphertext, nonce []byte, err error) {
	return b.encrypt(plaintext, nil)
}

// EncryptWithAAD encrypts a record-bound secret. Callers must provide stable,
// non-empty associated data; legacy secret formats continue to use Encrypt.
func (b *Box) EncryptWithAAD(plaintext string, aad []byte) (ciphertext, nonce []byte, err error) {
	if len(aad) == 0 {
		return nil, nil, errors.New("associated data is required")
	}
	return b.encrypt(plaintext, aad)
}

func (b *Box) encrypt(plaintext string, aad []byte) (ciphertext, nonce []byte, err error) {
	if plaintext == "" {
		return nil, nil, errors.New("API key is required")
	}
	aead := b.keys[b.currentVersion]
	nonce = make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return aead.Seal(nil, nonce, []byte(plaintext), aad), nonce, nil
}

func (b *Box) Decrypt(ciphertext, nonce []byte, version int) (string, error) {
	return b.decrypt(ciphertext, nonce, version, nil)
}

// DecryptWithAAD decrypts a record-bound secret. Associated data must exactly
// match the value used at encryption time.
func (b *Box) DecryptWithAAD(ciphertext, nonce []byte, version int, aad []byte) (string, error) {
	if len(aad) == 0 {
		return "", errors.New("associated data is required")
	}
	return b.decrypt(ciphertext, nonce, version, aad)
}

func (b *Box) decrypt(ciphertext, nonce []byte, version int, aad []byte) (string, error) {
	aead, exists := b.keys[version]
	if !exists {
		return "", fmt.Errorf("unsupported secret key version %d", version)
	}
	if len(nonce) != aead.NonceSize() {
		return "", errors.New("decrypt provider API key")
	}
	plaintext, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return "", errors.New("decrypt provider API key")
	}
	return string(plaintext), nil
}

func Last4(value string) string {
	runes := []rune(value)
	if len(runes) <= 4 {
		return string(runes)
	}
	return string(runes[len(runes)-4:])
}
