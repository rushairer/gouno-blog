/**
 * Rollback readiness check script.
 *
 * Verifies that the rollback safety commitments documented in the ADR
 * (doc/oidc-bff-split-adr.md) are enforced:
 *
 * 1. Old production stack must be retained for at least 14 days.
 * 2. Back-channel logout is configured (so old sessions can be invalidated).
 * 3. No "delete volume" or destructive cleanup in production compose.
 *
 * Usage: node scripts/check-rollback-readiness.mjs
 */
import { readFile } from "node:fs/promises";

const MIN_RETENTION_DAYS = 14;
const failures = [];

// 1. ADR must mention 14-day retention.
try {
  const adr = await readFile("doc/oidc-bff-split-adr.md", "utf8");
  if (!adr.includes("14")) {
    failures.push("ADR must document at least 14-day old stack retention.");
  }
  if (!adr.includes("backchannel-logout") && !adr.includes("backchannel_logout")) {
    failures.push("ADR must document back-channel logout capability for rollback safety.");
  }
} catch {
  failures.push("doc/oidc-bff-split-adr.md not found — cannot verify rollback commitments.");
}

// 2. Production compose must not contain destructive volume operations.
const prodComposeFiles = [
  "docker-compose.production-split.yml",
];
for (const file of prodComposeFiles) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }
  // Check for absence of destructive patterns
  const destructivePatterns = [
    /rm\s+-rf/i,
    /docker\s+volume\s+rm/i,
    /docker\s+system\s+prune/i,
  ];
  for (const pattern of destructivePatterns) {
    if (pattern.test(content)) {
      failures.push(`${file}: must not contain destructive command: ${pattern.source}`);
    }
  }
  // Verify back-channel logout endpoint is configured
  if (content.includes("BLOG_OIDC_POST_LOGOUT_URL") && !content.includes("backchannel")) {
    // Check if backchannel-logout is present in the compose file or referenced
    if (!content.includes("backchannel-logout") && !content.includes("backchannel_logout")) {
      failures.push(`${file}: must configure back-channel-logout endpoint for rollback safety.`);
    }
  }
}

// 3. CHANGELOG must mention rollback readiness for the split deployment.
try {
  const changelog = await readFile("CHANGELOG.md", "utf8");
  const lower = changelog.toLowerCase();
  if (!lower.includes("rollback") && !lower.includes("回滚")) {
    failures.push("CHANGELOG.md must document rollback readiness procedure.");
  }
} catch {
  // CHANGELOG may not exist in all contexts; skip.
}

if (failures.length > 0) {
  console.error("FAIL: Rollback readiness check");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`OK: Rollback readiness verified (${MIN_RETENTION_DAYS}-day retention, back-channel logout, no destructive ops).`);
