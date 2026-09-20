import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const repoRoot = resolve(frontendRoot, "..");
const ledgerRel = "docs/ui-redesign/showcase-parity-certifications.json";
const ledgerPath = resolve(repoRoot, ledgerRel);
const failures = [];

const allowedStatuses = new Set([
  "legacy-hardening-complete",
  "needs-manual-recertification",
  "verified",
  "blocked",
]);
const requiredFamilies = new Set([
  "blog-admin-ai",
  "blog-admin-core-support",
  "blog-public-account",
]);

function fail(message) {
  failures.push(message);
}

function git(cwd, args) {
  try {
    return {
      ok: true,
      output: execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch {
    return { ok: false, output: "" };
  }
}

function requireHistoryRef(cwd, ref, label) {
  const result = git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!result.ok && process.env.PARITY_STRICT_HISTORY === "1") {
    fail(`${label}: reviewed ref ${ref} is unavailable; certification freshness cannot be proven.`);
  }
  return result.ok;
}

function pathTouches(changed, prefixes) {
  return changed.some((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(prefix)),
  );
}

const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
if (ledger.schemaVersion !== 1) fail("Parity certification ledger schemaVersion must be 1.");
if (ledger.policy !== "manual-first-v1") {
  fail("Parity certification ledger must use the manual-first-v1 policy.");
}

const entries = ledger.certifications ?? [];
const ids = new Set();
for (const entry of entries) {
  if (!entry.id) {
    fail("Every parity certification entry needs an id.");
    continue;
  }
  if (ids.has(entry.id)) fail(`Duplicate parity certification id: ${entry.id}`);
  ids.add(entry.id);

  if (!allowedStatuses.has(entry.status)) {
    fail(`${entry.id}: unsupported status "${entry.status}".`);
  }
  if (entry.reviewMethod !== "manual-first") {
    fail(`${entry.id}: reviewMethod must remain "manual-first".`);
  }

  if (entry.status === "verified") {
    for (const field of [
      "manualReview",
      "reviewDate",
      "reviewedRefs",
      "gounoUiPackageVersion",
      "stateCoverage",
      "reviewDimensions",
      "ownedPaths",
      "canonicalPaths",
      "browserEvidence",
    ]) {
      if (!entry[field]) fail(`${entry.id}: verified certification is missing ${field}.`);
    }

    const coverage = new Set(entry.stateCoverage ?? []);
    for (const required of ["default", "feedback", "responsive"]) {
      if (!coverage.has(required)) {
        fail(`${entry.id}: verified stateCoverage must include ${required}.`);
      }
    }
    if (![..."detail editor drawer modal".split(" ")].some((name) =>
      [...coverage].some((value) => value.includes(name)),
    )) {
      fail(`${entry.id}: verified stateCoverage needs a detail/editor/drawer/modal state.`);
    }

    const dimensions = new Set(entry.reviewDimensions ?? []);
    for (const required of [
      "composition",
      "typography",
      "spacing",
      "feedback",
      "interaction",
      "responsive",
    ]) {
      if (!dimensions.has(required)) {
        fail(`${entry.id}: verified reviewDimensions must include ${required}.`);
      }
    }

    if (!entry.reviewedRefs?.blog || !entry.reviewedRefs?.gounoUi) {
      fail(`${entry.id}: verified reviewedRefs must include blog and gounoUi commits.`);
    }
    if ((entry.browserEvidence?.runs ?? []).length < 2) {
      fail(`${entry.id}: verified browserEvidence must record at least two workflow runs.`);
    }
    if ((entry.browserEvidence?.artifacts ?? []).length < 1) {
      fail(`${entry.id}: verified browserEvidence must retain at least one artifact.`);
    }

    const reviewPath = resolve(repoRoot, entry.manualReview ?? "");
    try {
      const review = await readFile(reviewPath, "utf8");
      if (!/Status:\s*\*\*verified\b/i.test(review)) {
        fail(`${entry.id}: manual review document must explicitly record verified status.`);
      }
      if (!/manual/i.test(review)) {
        fail(`${entry.id}: manual review document must describe manual review evidence.`);
      }
    } catch {
      fail(`${entry.id}: manual review document cannot be read: ${entry.manualReview}`);
    }

    if (requireHistoryRef(repoRoot, entry.reviewedRefs.blog, `${entry.id} Blog history`)) {
      const productDiff = git(repoRoot, [
        "diff",
        "--name-only",
        `${entry.reviewedRefs.blog}..HEAD`,
        "--",
        ...(entry.ownedPaths ?? []),
      ]);
      if (!productDiff.ok && process.env.PARITY_STRICT_HISTORY === "1") {
        fail(`${entry.id}: unable to compare reviewed Blog paths against HEAD.`);
      }
      const productChanged = productDiff.output.split("\n").filter(Boolean);
      if (productChanged.length) {
        fail(
          `${entry.id}: certification is stale because reviewed product paths changed after ${entry.reviewedRefs.blog.slice(0, 12)}: ${productChanged.join(", ")}`,
        );
      }
    }

    const packageJson = JSON.parse(
      await readFile(resolve(frontendRoot, "package.json"), "utf8"),
    );
    if (packageJson.dependencies?.["@gouno/ui"] !== entry.gounoUiPackageVersion) {
      fail(
        `${entry.id}: certification was reviewed on @gouno/ui ${entry.gounoUiPackageVersion}, current package uses ${packageJson.dependencies?.["@gouno/ui"] ?? "missing"}.`,
      );
    }

    const upstreamRoot = process.env.GOUNO_UI_CANONICAL_ROOT
      ? resolve(frontendRoot, process.env.GOUNO_UI_CANONICAL_ROOT)
      : "";
    if (upstreamRoot && requireHistoryRef(
      upstreamRoot,
      entry.reviewedRefs.gounoUi,
      `${entry.id} Gouno UI history`,
    )) {
      const upstreamDiff = git(upstreamRoot, [
        "diff",
        "--name-only",
        `${entry.reviewedRefs.gounoUi}..HEAD`,
        "--",
        ...(entry.canonicalPaths ?? []),
      ]);
      if (!upstreamDiff.ok && process.env.PARITY_STRICT_HISTORY === "1") {
        fail(`${entry.id}: unable to compare canonical Showcase paths against HEAD.`);
      }
      const upstreamChanged = upstreamDiff.output.split("\n").filter(Boolean);
      if (upstreamChanged.length) {
        fail(
          `${entry.id}: certification is stale because canonical Showcase paths changed after ${entry.reviewedRefs.gounoUi.slice(0, 12)}: ${upstreamChanged.join(", ")}`,
        );
      }
    }
  }
}

for (const family of requiredFamilies) {
  if (!ids.has(family)) fail(`Missing required parity certification family: ${family}`);
}

for (const legacyDoc of [
  "docs/ui-redesign/blog-admin-showcase-parity-hardening.md",
  "docs/ui-redesign/blog-public-account-showcase-parity-hardening.md",
]) {
  const content = await readFile(resolve(repoRoot, legacyDoc), "utf8");
  if (!/Legacy hardening/i.test(content.slice(0, 500))) {
    fail(`${legacyDoc}: top status must identify the report as legacy hardening evidence.`);
  }
}

const baseSha = process.env.PARITY_BASE_SHA?.trim();
if (baseSha) {
  const changedResult = git(repoRoot, ["diff", "--name-only", `${baseSha}...HEAD`]);
  if (!changedResult.ok && process.env.PARITY_STRICT_HISTORY === "1") {
    fail(`PR base ${baseSha}: unable to calculate certification-sensitive changes.`);
  }
  const changed = changedResult.output.split("\n").filter(Boolean);
  const baseLedgerResult = git(repoRoot, ["show", `${baseSha}:${ledgerRel}`]);
  if (baseLedgerResult.ok && baseLedgerResult.output) {
    const baseLedger = JSON.parse(baseLedgerResult.output);
    const baseById = new Map(
      (baseLedger.certifications ?? []).map((entry) => [entry.id, entry]),
    );
    for (const entry of entries.filter((item) => item.status === "verified")) {
      const baseEntry = baseById.get(entry.id);
      if (!baseEntry) continue;
      if (!pathTouches(changed, entry.ownedPaths ?? [])) continue;
      if (JSON.stringify(baseEntry) === JSON.stringify(entry)) {
        fail(
          `${entry.id}: this PR changes certified product paths but leaves the certification entry untouched. Re-review and refresh evidence, or demote it to needs-manual-recertification.`,
        );
      }
    }
  }
}

if (failures.length) {
  console.error("Showcase parity certification checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Showcase parity certification ledger is valid and current.");
