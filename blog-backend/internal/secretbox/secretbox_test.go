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

func TestEncryptWithAADBindsProviderRecord(t *testing.T) {
	box, err := New(testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	version := box.KeyVersion()
	providerAAD := ProviderAPIKeyAAD(42, version)
	ciphertext, nonce, err := box.EncryptWithAAD("sk-record-bound", providerAAD)
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := box.DecryptWithAAD(ciphertext, nonce, version, providerAAD)
	if err != nil || plaintext != "sk-record-bound" {
		t.Fatalf("decrypt = %q, %v", plaintext, err)
	}
	if _, err := box.DecryptWithAAD(ciphertext, nonce, version, ProviderAPIKeyAAD(43, version)); err == nil {
		t.Fatal("ciphertext moved to another Provider record must not decrypt")
	}
	if _, err := box.Decrypt(ciphertext, nonce, version); err == nil {
		t.Fatal("record-bound ciphertext must not decrypt through the legacy nil-AAD path")
	}
}

func TestEncryptWithAADRequiresStableContext(t *testing.T) {
	box, err := New(testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := box.EncryptWithAAD("secret", nil); err == nil {
		t.Fatal("expected missing associated data error")
	}
	if _, err := box.DecryptWithAAD([]byte("ciphertext"), []byte("nonce"), box.KeyVersion(), nil); err == nil {
		t.Fatal("expected missing associated data error")
	}
	if aad := ProviderAPIKeyAAD(0, box.KeyVersion()); len(aad) != 0 {
		t.Fatalf("invalid Provider ID produced AAD: %q", aad)
	}
	if aad := ProviderAPIKeyAAD(1, 0); len(aad) != 0 {
		t.Fatalf("invalid key version produced AAD: %q", aad)
	}
}

func TestDecryptRejectsInvalidNonceWithoutPanicking(t *testing.T) {
	box, err := New(testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := box.Decrypt([]byte("ciphertext"), []byte("short"), box.KeyVersion()); err == nil {
		t.Fatal("expected invalid nonce error")
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

func TestKeyringDecryptsRecordBoundSecretAcrossRotation(t *testing.T) {
	original, err := NewKeyring(testKey('a'), "1", "")
	if err != nil {
		t.Fatal(err)
	}
	aad := ProviderAPIKeyAAD(77, 1)
	ciphertext, nonce, err := original.EncryptWithAAD("rotating-record-secret", aad)
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := NewKeyring(testKey('b'), "2", "1:"+testKey('a'))
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := rotated.DecryptWithAAD(ciphertext, nonce, 1, ProviderAPIKeyAAD(77, 1))
	if err != nil || plaintext != "rotating-record-secret" {
		t.Fatalf("decrypt = %q, %v", plaintext, err)
	}
	if _, err := rotated.DecryptWithAAD(ciphertext, nonce, 1, ProviderAPIKeyAAD(77, 2)); err == nil {
		t.Fatal("changing the stored key version context must fail authentication")
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
