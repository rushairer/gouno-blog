package secretbox

import (
	"encoding/base64"
	"strings"
	"testing"
)

func testKey(fill byte) string {
	return base64.StdEncoding.EncodeToString([]byte(strings.Repeat(string(fill), 32)))
}

func TestEncryptUsesRandomNonceAndDecrypts(t *testing.T) {
	box, err := New(testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	first, nonce1, err := box.Encrypt("sk-secret-1234")
	if err != nil {
		t.Fatal(err)
	}
	second, nonce2, err := box.Encrypt("sk-secret-1234")
	if err != nil {
		t.Fatal(err)
	}
	if string(first) == string(second) || string(nonce1) == string(nonce2) {
		t.Fatal("expected randomized ciphertext and nonce")
	}
	got, err := box.Decrypt(first, nonce1, KeyVersion)
	if err != nil || got != "sk-secret-1234" {
		t.Fatalf("decrypt = %q, %v", got, err)
	}
}

func TestWrongKeyCannotDecrypt(t *testing.T) {
	first, _ := New(testKey('a'))
	second, _ := New(testKey('b'))
	ciphertext, nonce, _ := first.Encrypt("secret")
	if _, err := second.Decrypt(ciphertext, nonce, KeyVersion); err == nil {
		t.Fatal("expected decryption error")
	}
}

func TestKeyValidationAndLast4(t *testing.T) {
	if _, err := New("short"); err == nil {
		t.Fatal("expected invalid key error")
	}
	if got := Last4("abcdef"); got != "cdef" {
		t.Fatalf("Last4 = %q", got)
	}
}

func TestKeyringDecryptsPreviousVersionDuringRotation(t *testing.T) {
	original, err := NewKeyring(testKey('a'), "1", "")
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, nonce, err := original.Encrypt("rotating-secret")
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := NewKeyring(testKey('b'), "2", "1:"+testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	if rotated.KeyVersion() != 2 {
		t.Fatalf("version = %d", rotated.KeyVersion())
	}
	plaintext, err := rotated.Decrypt(ciphertext, nonce, 1)
	if err != nil || plaintext != "rotating-secret" {
		t.Fatalf("decrypt = %q, %v", plaintext, err)
	}
	newCiphertext, newNonce, err := rotated.Encrypt("new-secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := original.Decrypt(newCiphertext, newNonce, 2); err == nil {
		t.Fatal("old keyring must not decrypt the new version")
	}
}

func TestKeyringRejectsInvalidVersionConfiguration(t *testing.T) {
	if _, err := NewKeyring(testKey('a'), "0", ""); err == nil {
		t.Fatal("expected invalid current version")
	}
	if _, err := NewKeyring(testKey('a'), "2", "broken"); err == nil {
		t.Fatal("expected malformed previous key entry")
	}
	if _, err := NewKeyring(testKey('a'), "2", "2:"+testKey('b')); err == nil {
		t.Fatal("expected duplicate current version")
	}
}
