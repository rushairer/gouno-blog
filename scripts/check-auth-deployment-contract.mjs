import { readFile } from "node:fs/promises";

const required = new Map([
  [
    "docker-compose.production.yml",
    [
      "GOUNO_AUTH_LOGIN_URL: /identity-admin/login",
      "GOUNO_WEB_SERVER_TRUSTED_PROXIES: ${GOSSO_TRUSTED_PROXIES:?set an exact comma-separated CIDR list}",
    ],
  ],
  [
    "README.md",
    ["Blog 不提供 `/login`", "GOSSO_TRUSTED_PROXIES"],
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
  ["Caddyfile", ["@legacy_login", "redir @legacy_login"]],
  ["Caddyfile.audit", ["@legacy_login", "redir @legacy_login"]],
  ["Caddyfile.local-split", ["Access-Control-Allow-Origin *", ".local.test Domain=", "identity-admin"]],
  ["blog-frontend/src/App.tsx", ['path="/login"', 'path="/callback"']],
]);

for (const [path, snippets] of forbidden) {
  const content = await readFile(path, "utf8");
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      throw new Error(`${path}: forbidden legacy Blog login entry: ${snippet}`);
    }
  }
}

const splitCaddy = await readFile("Caddyfile.local-split", "utf8");
for (const hostname of ["sso.dev.local", "blog.dev.local", "cms.dev.local"]) {
  if (!splitCaddy.includes(`https://${hostname}`)) {
    throw new Error(`Caddyfile.local-split: missing distinct origin ${hostname}`);
  }
}

const blogBlock = splitCaddy.split("https://blog.dev.local", 2)[1]?.split("https://cms.dev.local", 1)[0] ?? "";
for (const identityPath of ["/.well-known", "/oauth2", "/oidc", "/api/v1"]) {
  if (blogBlock.includes(identityPath)) {
    throw new Error(`Caddyfile.local-split: Blog must not proxy identity path ${identityPath}`);
  }
}

console.log("Authentication deployment contract is intact.");
