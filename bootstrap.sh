#!/bin/bash
set -e

# Create keys directory
mkdir -p keys

# Generate private key if not exists
if [ ! -f keys/private.pem ]; then
  echo "Generating GOSSO RSA private key..."
  openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
  chmod 600 keys/private.pem
fi

# Generate .env if not exists
if [ ! -f .env ]; then
  echo "Generating .env with secure random secrets..."
  totp_key=$(openssl rand -hex 32)
  pepper_key=$(openssl rand -hex 32)
  cat <<EOF > .env
GOUNO_AUTH_TOTP_ENCRYPTION_KEY=$totp_key
GOUNO_AUTH_VERIFY_HASH_PEPPER=$pepper_key
EOF
else
  # If .env exists, ensure keys are present
  if ! grep -q "GOUNO_AUTH_TOTP_ENCRYPTION_KEY" .env; then
    echo "Adding GOUNO_AUTH_TOTP_ENCRYPTION_KEY to .env"
    echo "GOUNO_AUTH_TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
  fi
  if ! grep -q "GOUNO_AUTH_VERIFY_HASH_PEPPER" .env; then
    echo "Adding GOUNO_AUTH_VERIFY_HASH_PEPPER to .env"
    echo "GOUNO_AUTH_VERIFY_HASH_PEPPER=$(openssl rand -hex 32)" >> .env
  fi
fi

echo "Bootstrap complete! Secure environment generated in .env file."
