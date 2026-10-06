/**
 * Production image immutability enforcement.
 *
 * First-party application images must be supplied explicitly as immutable
 * version+digest references. Production Compose must fail closed when those
 * values are missing. Third-party infrastructure images remain digest-pinned
 * in the Compose source.
 *
 * Usage: node scripts/check-production-digest.mjs
 */
import { readFile } from "node:fs/promises";

const COMPOSE_FILES = ["docker-compose.production.yml"];
const ENV_EXAMPLE = ".env.production.example";
const IMAGE_LINE_RE = /^\s*image:\s*(.+?)\s*$/gm;
const FIRST_PARTY_VARS = [
  "GOSSO_IMAGE",
  "GOSSO_ADMIN_SEED_IMAGE",
  "GOSSO_ADMIN_FRONTEND_IMAGE",
  "GOUNO_BLOG_SEED_IMAGE",
  "GOUNO_BLOG_BACKEND_IMAGE",
  "GOUNO_BLOG_FRONTEND_IMAGE",
];
const FIRST_PARTY_RE =
  /ghcr\.io\/rushairer\/(?:gosso|gosso-admin-seed|gosso-admin-frontend|gouno-blog-seed|gouno-blog-backend|gouno-blog-frontend):/;
const IMMUTABLE_REF_RE = /:[^@\s]+@sha256:[0-9a-f]{64}$/;

const failures = [];
const checked = [];

for (const file of COMPOSE_FILES) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }

  for (const variable of FIRST_PARTY_VARS) {
    const marker = `image: ${${variable}:?`;
    if (!content.includes(marker)) {
      failures.push(
        `${file}: first-party image ${variable} must be required with a fail-closed ${variable}:? expression`,
      );
    }
  }

  let match;
  while ((match = IMAGE_LINE_RE.exec(content)) !== null) {
    const imageRef = match[1].replace(/\s+#.*$/, "").trim();
    checked.push(`${file}: ${imageRef}`);

    if (imageRef.startsWith("${")) {
      continue;
    }

    if (FIRST_PARTY_RE.test(imageRef)) {
      failures.push(
        `${file}: first-party image "${imageRef}" must not use an embedded mutable/default reference`,
      );
    } else if (!imageRef.includes("@sha256:")) {
      failures.push(
        `${file}: third-party image "${imageRef}" must use a digest reference (@sha256:...)`,
      );
    }
  }
}

let example = "";
try {
  example = await readFile(ENV_EXAMPLE, "utf8");
} catch {
  failures.push(`${ENV_EXAMPLE}: required production image example file is missing`);
}

for (const variable of FIRST_PARTY_VARS) {
  const match = example.match(new RegExp(`^${variable}=(.+)$`, "m"));
  if (!match) {
    failures.push(`${ENV_EXAMPLE}: missing ${variable}`);
    continue;
  }

  const value = match[1].trim();
  if (value.includes(":main")) {
    failures.push(`${ENV_EXAMPLE}: ${variable} must not use :main`);
  }
  if (!IMMUTABLE_REF_RE.test(value)) {
    failures.push(
      `${ENV_EXAMPLE}: ${variable} must use a version+digest reference`,
    );
  }
}

if (checked.length === 0) {
  console.error("WARNING: No image references found in production compose files.");
}

if (failures.length > 0) {
  console.error("FAIL: Production image immutability enforcement");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `OK: Production Compose fails closed for first-party images and all checked references follow the immutable image policy.`,
);
for (const item of checked) {
  console.log(`  ✓ ${item}`);
}
