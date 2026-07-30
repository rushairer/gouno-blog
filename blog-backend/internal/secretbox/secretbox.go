package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

const KeyVersion = 1

type Box struct {
	aead cipher.AEAD
}

func New(encodedKey string) (*Box, error) {
	if encodedKey == "" {
		return nil, errors.New("BLOG_AGENT_MASTER_KEY is required")
	}
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode BLOG_AGENT_MASTER_KEY: %w", err)
	}
	if len(key) != 32 {
		return nil, errors.New("BLOG_AGENT_MASTER_KEY must be base64 for exactly 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

func (b *Box) Encrypt(plaintext string) (ciphertext, nonce []byte, err error) {
	if plaintext == "" {
		return nil, nil, errors.New("API key is required")
	}
	nonce = make([]byte, b.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return b.aead.Seal(nil, nonce, []byte(plaintext), nil), nonce, nil
}

func (b *Box) Decrypt(ciphertext, nonce []byte, version int) (string, error) {
	if version != KeyVersion {
		return "", fmt.Errorf("unsupported secret key version %d", version)
	}
	plaintext, err := b.aead.Open(nil, nonce, ciphertext, nil)
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
