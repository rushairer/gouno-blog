#!/usr/bin/env bash
# Exercise the built static-server image without publishing host ports.
set -euo pipefail

image="${1:?Provide the exact built frontend image reference}"
container_id=""
cleanup() {
  if [[ -n "$container_id" ]]; then
    docker rm -f "$container_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

container_id="$(docker run -d "$image")"
uid="$(docker exec "$container_id" id -u)"
[[ "$uid" =~ ^[0-9]+$ && "$uid" != "0" ]] || {
  echo "Frontend must run as a non-root user" >&2
  exit 1
}
docker exec "$container_id" nginx -t

docker exec "$container_id" sh -ec '
  # Absence, not a CVE ignore: static serving needs none of these modules/libs.
  for package in libxml2 libxslt libexpat libpng tiff nghttp2-libs nginx-module-xslt nginx-module-njs nginx-module-image-filter; do
    if apk info -e "$package" >/dev/null 2>&1; then
      echo "Unexpected optional frontend runtime dependency: $package" >&2
      exit 1
    fi
  done

  body=$(mktemp)
  headers=$(mktemp)
  trap '\''rm -f "$body" "$headers"'\'' EXIT
  ready=0
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if wget -q -O "$body" http://127.0.0.1:8081/; then
      ready=1
      break
    fi
    sleep 1
  done
  test "$ready" = 1

  for path in / "/admin/ai-settings?section=api-access"; do
    wget -S -O "$body" "http://127.0.0.1:8081$path" 2>"$headers"
    cmp "$body" /usr/share/nginx/html/index.html
    grep -iF "X-Content-Type-Options: nosniff" "$headers"
    grep -iF "X-Frame-Options: SAMEORIGIN" "$headers"
    grep -iF "Referrer-Policy: strict-origin-when-cross-origin" "$headers"
    grep -iF "Permissions-Policy: camera=(), microphone=(), geolocation=()" "$headers"
    grep -iF "Strict-Transport-Security: max-age=63072000; includeSubDomains" "$headers"
    grep -iF "Cross-Origin-Opener-Policy: same-origin" "$headers"
    grep -iF "Cross-Origin-Resource-Policy: same-origin" "$headers"
  done
'
echo "Frontend runtime contract passed: non-root, configuration, minimal dependencies, SPA routes and security headers"
