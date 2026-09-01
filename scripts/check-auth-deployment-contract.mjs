import { readFile } from "node:fs/promises";

const required = new Map([
  [
    "docker-compose.production.yml",
    [
      "GOUNO_AUTH_LOGIN_URL: /login",
      "GOUNO_WEB_SERVER_TRUSTED_PROXIES: ${GOSSO_TRUSTED_PROXIES:?set GOSSO_TRUSTED_PROXIES}",
      "BLOG_BFF_ENABLED: \"true\"",
      "POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password",
      "GOUNO_DATABASE_DRIVERS_POSTGRES_DSN_FILE: /run/secrets/gosso_database_dsn",
      "GOUNO_REDIS_DSN_FILE: /run/secrets/gosso_redis_dsn",
      "PG_DSN_FILE: /run/secrets/gosso_database_dsn",
      "REDIS_DSN_FILE: /run/secrets/gosso_redis_dsn",
      "GOUNO_WEB_SERVER_TRUSTED_PROXIES: 172.21.0.0/16",
      "GOUNO_DATABASE_DRIVERS_POSTGRES_DSN_FILE: /run/secrets/blog_database_dsn",
      "GOUNO_REDIS_DSN_FILE: /run/secrets/blog_redis_dsn",
      "BLOG_OIDC_REDIRECT_URL: https://${BLOG_DOMAIN:?set BLOG_DOMAIN}/api/auth/callback",
      "BLOG_OIDC_POST_LOGOUT_URL: https://${BLOG_DOMAIN:?set BLOG_DOMAIN}/api/auth/logout/callback",
      "BLOG_OAUTH_BACKCHANNEL_LOGOUT_URI: https://${BLOG_DOMAIN:?set BLOG_DOMAIN}/api/auth/backchannel-logout",
	      "AWS_ACCESS_KEY_ID_FILE: /run/secrets/blog_media_s3_access_key_id",
	      "AWS_SECRET_ACCESS_KEY_FILE: /run/secrets/blog_media_s3_secret_access_key",
      'BLOG_OAUTH_ALLOW_ACCOUNT_FALLBACK: "false"',
      'BLOG_OAUTH_SEED_CONSENT: "false"',
      'BLOG_OAUTH_ACCOUNT_ID: ${BLOG_BOOTSTRAP_OWNER_SUBJECT:?set BLOG_BOOTSTRAP_OWNER_SUBJECT}',
    ],
  ],
  [
    "README.md",
    ["Blog 不提供 `/login`", "GOSSO_TRUSTED_PROXIES"],
  ],
  [
    "docker-compose.yml",
    [
      "SSL_CERT_FILE=/etc/ssl/certs/local-dev-root-ca.pem",
      "${LOCAL_TLS_ROOT_CA_FILE:-./certs/local-dev-root-ca.pem}:/etc/ssl/certs/local-dev-root-ca.pem:ro",
    ],
  ],
]);

const failures = [];
for (const [path, snippets] of required) {
  const content = await readFile(path, "utf8");
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${path}: missing authentication contract: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

const forbidden = new Map([
  ["Caddyfile", ["@legacy_login", "redir @legacy_login", "Access-Control-Allow-Origin *", ".local.test Domain=", "identity-admin"]],
  ["Caddyfile.production", ["@legacy_login", "redir @legacy_login", "Access-Control-Allow-Origin *", "Domain=", "identity-admin"]],
  ["blog-frontend/src/App.tsx", ['path="/login"', 'path="/callback"']],
  ["docker-compose.yml", ["BLOG_OIDC_INTERNAL_ENDPOINT", "blog.local.test", "sso.local.test", "https://sso.dev.local:443", "https://blog.dev.local:443", "8443"]],
  ["docker-compose.source.yml", ["localhost:8443", "8443"]],
  ["docker-compose.production.yml", [
    "BLOG_OIDC_INTERNAL_ENDPOINT",
    "POSTGRES_PASSWORD: ${",
    "REDIS_PASSWORD: ${",
    "BLOG_REDIS_PASSWORD: ${",
    "GOUNO_DATABASE_DRIVERS_POSTGRES_DSN: ${",
    "GOUNO_REDIS_DSN: ${",
    "GOUNO_SMTP_PASSWORD: ${",
    "PG_DSN: ${",
    "REDIS_DSN: ${",
    "ADMIN_PASSWORD: ${",
	    "AWS_ACCESS_KEY_ID: ${",
    "AWS_SECRET_ACCESS_KEY: ${",
	    "BLOG_OAUTH_OWNER_ID",
  ]],
  ["Caddyfile", [":443", "8443"]],
  [".env.example", [":443", "8443"]],
  ["blog-backend/config/openapi.yaml", ["BearerAuth"]],
]);

for (const [path, snippets] of forbidden) {
  const content = await readFile(path, "utf8");
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      throw new Error(`${path}: forbidden legacy Blog login entry: ${snippet}`);
    }
  }
}

const localCaddy = await readFile("Caddyfile", "utf8");
for (const hostname of ["sso.dev.local", "blog.dev.local", "cms.dev.local"]) {
  if (!localCaddy.includes(`https://${hostname}`)) {
    throw new Error(`Caddyfile: missing distinct origin ${hostname}`);
  }
}

const blogBlock = localCaddy.split("https://blog.dev.local", 2)[1]?.split("https://cms.dev.local", 1)[0] ?? "";
for (const identityPath of ["/.well-known", "/oauth2", "/oidc", "/api/v1"]) {
  if (blogBlock.includes(identityPath)) {
    throw new Error(`Caddyfile: Blog must not proxy identity path ${identityPath}`);
  }
}

console.log("Authentication deployment contract is intact.");

// Also enforce production image digest pinning.
await import("./check-production-digest.mjs");
