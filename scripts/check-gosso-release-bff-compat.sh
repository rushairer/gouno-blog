#!/usr/bin/env bash
set -euo pipefail

GOSSO_RELEASE_VERSION="${GOSSO_RELEASE_VERSION:-1.6.1}"
GOSSO_RELEASE_DIGEST="${GOSSO_RELEASE_DIGEST:-sha256:cf3c321279b9860bbbcf30735dcd0d3a3465151075420d8fa70d6d66e580838b}"
GOSSO_COMPAT_PORT="${GOSSO_COMPAT_PORT:-18081}"
GOSSO_RUNTIME_UID="${GOSSO_RUNTIME_UID:-100}"
BLOG_RUNTIME_UID="${BLOG_RUNTIME_UID:-10001}"
BLOG_RESOURCE="https://blog.dev.local/api"
BLOG_CLIENT_ID="blog-bff"
BLOG_CLIENT_SECRET="blog-bff-secret-local"
GOSSO_IMAGE="ghcr.io/rushairer/gosso:v${GOSSO_RELEASE_VERSION}@${GOSSO_RELEASE_DIGEST}"

export GOSSO_IMAGE
export NO_PROXY="127.0.0.1,localhost,sso.dev.local,blog.dev.local,cms.dev.local,${NO_PROXY:-}"
export no_proxy="$NO_PROXY"

key_dir="$(mktemp -d)"
cert_dir="$(mktemp -d)"
secret_dir="$(mktemp -d)"
override_file="$(mktemp)"
hosts_marker="# gouno-blog-gosso-release-compat"
compose=()

cleanup() {
  rc=$?
  trap - EXIT
  if [ ${#compose[@]} -gt 0 ] && [ "$rc" -ne 0 ]; then
    printf '\n[compat] failure diagnostics\n' >&2
    "${compose[@]}" ps >&2 || true
    "${compose[@]}" logs --no-color gosso blog-backend gateway db redis >&2 || true
  fi
  if [ ${#compose[@]} -gt 0 ]; then
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  sudo sed -i "/${hosts_marker//\//\\/}/d" /etc/hosts 2>/dev/null || true
  sudo chown -R "$(id -u):$(id -g)" "$key_dir" "$secret_dir" 2>/dev/null || true
  rm -rf "$key_dir" "$cert_dir" "$secret_dir" "$override_file"
  exit "$rc"
}
trap cleanup EXIT

prepare_tls() {
  openssl genrsa -out "$cert_dir/root-key.pem" 2048 >/dev/null 2>&1
  openssl req -x509 -new -nodes -key "$cert_dir/root-key.pem" -sha256 -days 1 \
    -subj '/CN=Gouno Blog Compatibility Root CA' -out "$cert_dir/root.pem" >/dev/null 2>&1
  cat >"$cert_dir/server.ext" <<'EOF'
subjectAltName=DNS:sso.dev.local,DNS:blog.dev.local,DNS:cms.dev.local
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
  openssl genrsa -out "$cert_dir/server-key.pem" 2048 >/dev/null 2>&1
  openssl req -new -key "$cert_dir/server-key.pem" -subj '/CN=sso.dev.local' \
    -out "$cert_dir/server.csr" >/dev/null 2>&1
  openssl x509 -req -in "$cert_dir/server.csr" -CA "$cert_dir/root.pem" \
    -CAkey "$cert_dir/root-key.pem" -CAcreateserial -days 1 -sha256 \
    -extfile "$cert_dir/server.ext" -out "$cert_dir/server.pem" >/dev/null 2>&1
  chmod 644 "$cert_dir/root.pem" "$cert_dir/server.pem"
  chmod 600 "$cert_dir/root-key.pem" "$cert_dir/server-key.pem"
}

prepare_gosso_key() {
  openssl genpkey -algorithm RSA -out "$key_dir/private.pem" \
    -pkeyopt rsa_keygen_bits:2048 >/dev/null 2>&1
  chmod 700 "$key_dir"
  chmod 600 "$key_dir/private.pem"
  if [ "$(id -u)" -eq 0 ]; then
    chown -R "${GOSSO_RUNTIME_UID}:${GOSSO_RUNTIME_UID}" "$key_dir"
  else
    sudo chown -R "${GOSSO_RUNTIME_UID}:${GOSSO_RUNTIME_UID}" "$key_dir"
  fi
}

assert_blog_token() {
  ACCESS_TOKEN="$1" BLOG_RESOURCE="$BLOG_RESOURCE" BLOG_CLIENT_ID="$BLOG_CLIENT_ID" python3 - <<'PY'
import base64, json, os

def part(value):
    value += '=' * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(value).decode())

header_raw, payload_raw, _ = os.environ['ACCESS_TOKEN'].split('.')
header, payload = part(header_raw), part(payload_raw)
assert header.get('typ') == 'at+jwt', header
assert payload.get('principal_type') == 'delegated_user', payload
assert payload.get('client_id') == os.environ['BLOG_CLIENT_ID'], payload
aud = payload.get('aud')
if isinstance(aud, str):
    aud = [aud]
assert aud == [os.environ['BLOG_RESOURCE']], payload
assert payload.get('sub') and payload.get('account_id') == payload.get('sub'), payload
PY
}

prepare_tls
prepare_gosso_key
export LOCAL_TLS_ROOT_CA_FILE="$cert_dir/root.pem"
export LOCAL_TLS_CERT_FILE="$cert_dir/server.pem"
export LOCAL_TLS_KEY_FILE="$cert_dir/server-key.pem"

cat >"$override_file" <<EOF
services:
  gosso:
    environment:
      GOUNO_WEB_SERVER_DEBUG: "true"
    ports:
      - "127.0.0.1:${GOSSO_COMPAT_PORT}:8080"
    volumes:
      - "${key_dir}:/app/keys"
      - "${LOCAL_TLS_ROOT_CA_FILE}:/etc/ssl/certs/local-dev-root-ca.pem:ro"
  blog-backend:
    volumes:
      - blog_media:/app/data/media
      - "${secret_dir}:/run/secrets:ro"
      - "${LOCAL_TLS_ROOT_CA_FILE}:/etc/ssl/certs/local-dev-root-ca.pem:ro"
EOF
compose=(docker compose -f docker-compose.yml -f docker-compose.source.yml -f "$override_file")

printf '[compat] Gosso release: v%s@%s\n' "$GOSSO_RELEASE_VERSION" "$GOSSO_RELEASE_DIGEST"
compose_json="$("${compose[@]}" config --format json)"
COMPOSE_JSON="$compose_json" EXPECTED_IMAGE="$GOSSO_IMAGE" python3 - <<'PY'
import json, os
cfg = json.loads(os.environ['COMPOSE_JSON'])
gosso = cfg['services']['gosso']
assert gosso.get('image') == os.environ['EXPECTED_IMAGE'], gosso.get('image')
allowed = (gosso.get('environment') or {}).get('GOUNO_AUTH_BACKCHANNEL_ALLOWED_CIDRS')
assert allowed == '172.21.0.0/16', allowed
assert '127.0.0.1' not in allowed and '::1' not in allowed, allowed
PY
printf '[ok] deployment contract pins the release and private-CIDR exception only\n'

"${compose[@]}" pull gosso gosso-admin-seed
"${compose[@]}" build blog-backend blog-client-seed

if [ "$(id -u)" -eq 0 ]; then
  chown "${BLOG_RUNTIME_UID}:${BLOG_RUNTIME_UID}" "$secret_dir"
else
  sudo chown "${BLOG_RUNTIME_UID}:${BLOG_RUNTIME_UID}" "$secret_dir"
fi
docker run --rm -v "$secret_dir:/out" gouno-blog-backend:local \
  bff-keygen --out /out/blog-bff-tink.json >/tmp/blog-bff-keygen.txt

"${compose[@]}" up -d db redis mailpit gosso
ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${GOSSO_COMPAT_PORT}/readiness" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
[ "$ready" = true ] || { echo '[compat] released Gosso did not become ready' >&2; exit 1; }
printf '[ok] release image booted, migrated, and became ready\n'

"${compose[@]}" run --rm --no-deps gosso-admin-seed
"${compose[@]}" run --rm --no-deps blog-client-seed
blog_policy="$("${compose[@]}" exec -T db psql -U postgres -d gosso -Atc \
  "SELECT CASE WHEN COUNT(*)=1 THEN 'ok' ELSE 'bad' END FROM oauth2_clients WHERE client_id='blog-bff' AND is_confidential=true AND grant_types ? 'authorization_code' AND grant_types ? 'refresh_token' AND scopes ? 'openid' AND allowed_resources='[\"https://blog.dev.local/api\"]'::jsonb AND backchannel_logout_uri='https://blog.dev.local/api/auth/backchannel-logout' AND backchannel_logout_session_required=true;")"
[ "$blog_policy" = ok ] || { echo '[compat] blog-bff seed policy mismatch' >&2; exit 1; }
printf '[ok] current Blog seed matches confidential BFF/resource/back-channel policy\n'

login_json="$(curl -fsS -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/api/v1/auth/login")"
login_access_token="$(printf '%s' "$login_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["access_token"])')"
[ -n "$login_access_token" ] || { echo '[compat] bootstrap login failed' >&2; exit 1; }

pkce_verifier='gouno-blog-release-compatibility-verifier-0123456789-ABCDE'
pkce_challenge="$(printf '%s' "$pkce_verifier" | python3 -c 'import base64,hashlib,sys; print(base64.urlsafe_b64encode(hashlib.sha256(sys.stdin.buffer.read()).digest()).rstrip(b"=").decode())')"
authorize_url="http://127.0.0.1:${GOSSO_COMPAT_PORT}/oauth2/authorize?response_type=code&client_id=${BLOG_CLIENT_ID}&redirect_uri=https%3A%2F%2Fblog.dev.local%2Fapi%2Fauth%2Fcallback&scope=openid%20profile%20email&state=blog-compat-state&code_challenge=${pkce_challenge}&code_challenge_method=S256&resource=https%3A%2F%2Fblog.dev.local%2Fapi"
authorize_status="$(curl -sS -D /tmp/blog-auth-headers -o /tmp/blog-auth-body -w '%{http_code}' \
  -H "Authorization: Bearer ${login_access_token}" "$authorize_url")"
if [ "$authorize_status" = 200 ]; then
  consent_id="$(python3 - <<'PY'
import html,re
body=open('/tmp/blog-auth-body',encoding='utf-8').read()
m=re.search(r'name="consent_id"\s+value="([^"]+)"',body)
assert m, 'consent_id missing'
print(html.unescape(m.group(1)))
PY
)"
  curl -sS -D /tmp/blog-auth-headers -o /tmp/blog-auth-body \
    -H "Authorization: Bearer ${login_access_token}" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "client_id=${BLOG_CLIENT_ID}" \
    --data-urlencode 'redirect_uri=https://blog.dev.local/api/auth/callback' \
    --data-urlencode 'scope=openid profile email' \
    --data-urlencode 'state=blog-compat-state' \
    --data-urlencode 'approved=true' --data-urlencode 'response_type=code' \
    --data-urlencode "code_challenge=${pkce_challenge}" \
    --data-urlencode 'code_challenge_method=S256' \
    --data-urlencode "resource=${BLOG_RESOURCE}" \
    --data-urlencode "consent_id=${consent_id}" \
    "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oauth2/authorize" >/dev/null
elif [ "$authorize_status" != 302 ]; then
  echo "[compat] authorization returned HTTP ${authorize_status}" >&2
  exit 1
fi

location="$(awk 'BEGIN{IGNORECASE=1} /^location:/{sub(/^[^:]*:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' /tmp/blog-auth-headers)"
code="$(LOCATION="$location" python3 - <<'PY'
import os
from urllib.parse import parse_qs,urlparse
print(parse_qs(urlparse(os.environ['LOCATION']).query).get('code',[''])[0])
PY
)"
[ -n "$code" ] || { echo "[compat] authorization code missing: $location" >&2; exit 1; }

token_json="$(curl -fsS -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' --data-urlencode "code=${code}" \
  --data-urlencode 'redirect_uri=https://blog.dev.local/api/auth/callback' \
  --data-urlencode "client_id=${BLOG_CLIENT_ID}" --data-urlencode "client_secret=${BLOG_CLIENT_SECRET}" \
  --data-urlencode "code_verifier=${pkce_verifier}" --data-urlencode "resource=${BLOG_RESOURCE}" \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oauth2/token")"
resource_access_token="$(printf '%s' "$token_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
refresh_token="$(printf '%s' "$token_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["refresh_token"])')"
assert_blog_token "$resource_access_token"
printf '[ok] Authorization Code + PKCE issued an RFC 8707 Blog-only delegated token\n'

userinfo_status="$(curl -sS -o /tmp/blog-userinfo -w '%{http_code}' \
  -H "Authorization: Bearer ${resource_access_token}" \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oidc/userinfo")"
[ "$userinfo_status" -ge 400 ] || { echo '[compat] Blog token crossed UserInfo audience boundary' >&2; exit 1; }
printf '[ok] Blog-resource token is rejected at the Gosso UserInfo audience boundary\n'

refresh_json="$(curl -fsS -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' --data-urlencode "refresh_token=${refresh_token}" \
  --data-urlencode "client_id=${BLOG_CLIENT_ID}" --data-urlencode "client_secret=${BLOG_CLIENT_SECRET}" \
  --data-urlencode "resource=${BLOG_RESOURCE}" \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oauth2/token")"
refreshed_access_token="$(printf '%s' "$refresh_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
refreshed_refresh_token="$(printf '%s' "$refresh_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("refresh_token",""))')"
assert_blog_token "$refreshed_access_token"
printf '[ok] refresh preserves the exact Blog resource audience\n'

printf '127.0.0.1 sso.dev.local blog.dev.local %s\n' "$hosts_marker" | sudo tee -a /etc/hosts >/dev/null
"${compose[@]}" up -d --no-deps gateway
for _ in $(seq 1 30); do
  curl -fsS --cacert "$LOCAL_TLS_ROOT_CA_FILE" https://sso.dev.local/.well-known/openid-configuration >/dev/null 2>&1 && break
  sleep 1
done
"${compose[@]}" run --rm --no-deps blog-media-init
"${compose[@]}" up -d --no-deps blog-backend
backend_ready=false
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T blog-backend wget -qO- http://127.0.0.1:8082/healthz >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  sleep 2
done
[ "$backend_ready" = true ] || { echo '[compat] Blog backend did not become healthy' >&2; exit 1; }

curl -sS -D /tmp/bff-login-headers -o /tmp/bff-login-body --cacert "$LOCAL_TLS_ROOT_CA_FILE" \
  'https://blog.dev.local/api/auth/login?return_to=%2Fadmin' >/dev/null
BFF_RESOURCE="$BLOG_RESOURCE" python3 - <<'PY'
import os
from urllib.parse import parse_qs,urlparse
headers=open('/tmp/bff-login-headers',encoding='utf-8').read().splitlines()
location=next((x.split(':',1)[1].strip() for x in headers if x.lower().startswith('location:')),'')
cookies=[x.split(':',1)[1].strip() for x in headers if x.lower().startswith('set-cookie:')]
assert location.startswith('https://sso.dev.local/oauth2/authorize?'), location
q=parse_qs(urlparse(location).query)
assert q.get('client_id')==['blog-bff'] and q.get('response_type')==['code'], q
assert q.get('resource')==[os.environ['BFF_RESOURCE']], q
assert q.get('code_challenge_method')==['S256'] and q.get('acr_values')==['urn:gouno:aal2'], q
flow=next((c for c in cookies if c.startswith('__Host-Http-blog-oidc-flow=')),'')
assert flow, cookies
attrs=flow.lower()
for required in ('path=/','secure','httponly','samesite=lax'):
    assert required in attrs, flow
joined=''.join(cookies).lower()
assert 'access_token' not in joined and 'refresh_token' not in joined
PY
printf '[ok] live BFF login exposes only an HttpOnly flow handle and requests PKCE/resource/AAL2\n'

logout_json="$(curl -fsS -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/api/v1/auth/login")"
logout_access_token="$(printf '%s' "$logout_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["access_token"])')"
logout_status="$(curl -sS -o /tmp/blog-logout -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${logout_access_token}" \
  -H 'Content-Type: application/x-www-form-urlencoded' --data '' \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oidc/logout")"
[ "$logout_status" -lt 400 ] || { echo "[compat] Gosso logout HTTP ${logout_status}" >&2; exit 1; }

# Delivery is proven at the receiving resource server. A 200 entry can only be
# emitted after the current BFF parsed and validated the logout token. Also
# fail if Gosso reports an outbound error or exhausted retry budget.
backchannel_ok=false
for _ in $(seq 1 20); do
  backend_logs="$("${compose[@]}" logs --no-color blog-backend 2>&1 || true)"
  gosso_logs="$("${compose[@]}" logs --no-color gosso 2>&1 || true)"
  if printf '%s' "$gosso_logs" | grep -Eq 'Back-channel logout retries exhausted|Back-channel logout POST returned error status'; then
    echo '[compat] Gosso reported a back-channel delivery failure' >&2
    exit 1
  fi
  if printf '%s' "$backend_logs" | grep -Eiq '\|[[:space:]]*200[[:space:]]*\|.*POST[[:space:]]+/api/auth/backchannel-logout'; then
    backchannel_ok=true
    break
  fi
  sleep 1
done
[ "$backchannel_ok" = true ] || { echo '[compat] Blog BFF never accepted the back-channel logout' >&2; exit 1; }
printf '[ok] HTTPS back-channel logout reached and was accepted by the current Blog BFF\n'

revoke_token="$refreshed_refresh_token"
[ -n "$revoke_token" ] || revoke_token="$refresh_token"
revoke_status="$(curl -sS -o /tmp/blog-revoke -w '%{http_code}' \
  -u "${BLOG_CLIENT_ID}:${BLOG_CLIENT_SECRET}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "token=${revoke_token}" --data-urlencode 'token_type_hint=refresh_token' \
  "http://127.0.0.1:${GOSSO_COMPAT_PORT}/oauth2/revoke")"
[ "$revoke_status" -lt 400 ] || { echo "[compat] RFC 7009 revoke HTTP ${revoke_status}" >&2; exit 1; }
printf '[ok] confidential BFF can revoke its server-held refresh credential\n'

printf '\nGouno Blog BFF acceptance passed against Gosso v%s.\n' "$GOSSO_RELEASE_VERSION"
