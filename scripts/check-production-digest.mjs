/**
 * Production image channel enforcement script.
 *
 * First-party application images follow main unless an operator explicitly
 * overrides their Compose variables. Third-party infrastructure images stay
 * pinned to immutable digests.
 *
 * Usage: node scripts/check-production-digest.mjs
 */
import { readFile } from "node:fs/promises";

const COMPOSE_FILES = [
  "docker-compose.production.yml",
];

const IMAGE_LINE_RE = /^\s*image:\s*(.+?)\s*$/gm;
const FIRST_PARTY_IMAGE_RE = /ghcr\.io\/rushairer\/(?:gosso|gosso-admin-seed|gosso-admin-frontend|gouno-blog-seed|gouno-blog-backend|gouno-blog-frontend):/;

const failures = [];
const checked = [];

for (const file of COMPOSE_FILES) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    // File may not exist in all environments; skip silently.
    continue;
  }

  let match;
  while ((match = IMAGE_LINE_RE.exec(content)) !== null) {
    const imageRef = match[1].replace(/\s+#.*$/, "").trim();
    checked.push(`${file}: ${imageRef}`);

    if (FIRST_PARTY_IMAGE_RE.test(imageRef)) {
      if (!imageRef.includes(":main}")) {
        failures.push(
          `${file}: first-party image "${imageRef}" must default to :main`,
        );
      }
    } else if (!imageRef.includes("@sha256:")) {
      failures.push(
        `${file}: third-party image "${imageRef}" must use a digest reference (@sha256:...)`,
      );
    }
  }
}

if (checked.length === 0) {
  console.error("WARNING: No image references found in production compose files.");
}

if (failures.length > 0) {
  console.error("FAIL: Production image channel enforcement");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`OK: All ${checked.length} production image references follow the production channel policy.`);
for (const c of checked) {
  console.log(`  ✓ ${c}`);
}
