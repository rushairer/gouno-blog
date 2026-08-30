#!/usr/bin/env sh
# Generate one development certificate with distinct local hostnames. Sharing
# the certificate does not share origins, cookies, storage, or application
# sessions; the hostnames remain separate browser security boundaries.
set -eu

if ! command -v mkcert >/dev/null 2>&1; then
	printf '%s\n' 'mkcert is required. Install it first (for example: brew install mkcert), then rerun this script.' >&2
	exit 1
fi

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cert_dir="$repository_root/certs"
cert_file="$cert_dir/localhost.pem"
key_file="$cert_dir/localhost-key.pem"

mkdir -p "$cert_dir"
chmod 700 "$cert_dir"
mkcert -install
mkcert -cert-file "$cert_file" -key-file "$key_file" \
	localhost sso.dev.local blog.dev.local cms.dev.local 127.0.0.1 ::1
cp "$(mkcert -CAROOT)/rootCA.pem" "$cert_dir/local-dev-root-ca.pem"
chmod 644 "$cert_file"
chmod 644 "$cert_dir/local-dev-root-ca.pem"
chmod 600 "$key_file"

printf '%s\n' "Generated $cert_file and $key_file"
printf '%s\n' 'Ensure sso.dev.local, blog.dev.local, and cms.dev.local resolve to 127.0.0.1 before starting the split-origin stack.'
