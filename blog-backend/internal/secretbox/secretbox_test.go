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
