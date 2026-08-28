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
  ["blog-frontend/src/App.tsx", ['path="/login"']],
]);

for (const [path, snippets] of forbidden) {
  const content = await readFile(path, "utf8");
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      throw new Error(`${path}: forbidden legacy Blog login entry: ${snippet}`);
    }
  }
}

console.log("Authentication deployment contract is intact.");
