/**
 * Production image digest enforcement script.
 *
 * Verifies that all image references in production compose files use
 * immutable digest references (e.g. @sha256:abc123...) rather than
 * floating tags (e.g. :latest, :v1.2.3). This prevents accidental
 * rollback to an older or tampered image.
 *
 * Usage: node scripts/check-production-digest.mjs
 */
import { readFile } from "node:fs/promises";

const COMPOSE_FILES = [
  "docker-compose.production-split.yml",
  "docker-compose.production.yml",
];

// Pattern: image: <name>[:<tag>][@<digest>]
// We only accept references that include @sha256:
const IMAGE_LINE_RE = /^\s*image:\s*(\S+)\s*$/gm;

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
    const imageRef = match[1];
    checked.push(`${file}: ${imageRef}`);

    if (!imageRef.includes("@sha256:")) {
      failures.push(
        `${file}: image "${imageRef}" must use a digest reference (@sha256:...), not a floating tag`,
      );
    }
  }
}

if (checked.length === 0) {
  console.error("WARNING: No image references found in production compose files.");
}

if (failures.length > 0) {
  console.error("FAIL: Production image digest enforcement");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`OK: All ${checked.length} production image references use digest pinning.`);
for (const c of checked) {
  console.log(`  ✓ ${c}`);
}
