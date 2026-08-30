/**
 * Production image digest enforcement script.
 *
 * Verifies that all image references in production compose files use
 * immutable digest references (e.g. @sha256:abc123...) rather than
 * floating tags (e.g. :latest, :v1.2.3). This prevents accidental
 * deployment of an older or tampered image.
 *
 * Usage: node scripts/check-production-digest.mjs
 */
import { readFile } from "node:fs/promises";

const COMPOSE_FILES = [
  "docker-compose.production.yml",
];

// Capture the complete YAML scalar, including Compose interpolation messages
// that contain spaces (for example `${GOSSO_IMAGE:?set ...@sha256:digest}`).
const IMAGE_LINE_RE = /^\s*image:\s*(.+?)\s*$/gm;

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
