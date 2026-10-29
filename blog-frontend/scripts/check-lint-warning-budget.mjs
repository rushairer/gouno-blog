import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

// Measured baseline after removing an unused Sudo Hook test import (#396),
// one unused Playwright layout computation, and three redundant regex/template
// escapes in the UI contract checker. Lower only after actual warning repairs;
// never raise this ceiling to accommodate regressions.
export const maxAllowedWarnings = 61;

export function parseOxlintSummary(output) {
  const ansiColor = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const plain = output.replace(ansiColor, "").replace(/\r/g, "");
  const matches = [
    ...plain.matchAll(/\bFound\s+(\d+)\s+warnings?\s+and\s+(\d+)\s+errors?\b/g),
  ];
  if (matches.length !== 1) {
    throw new Error("Oxlint did not emit exactly one recognizable summary; rejecting unverifiable lint output");
  }
  const warnings = Number(matches[0][1]);
  const errors = Number(matches[0][2]);
  if (!Number.isSafeInteger(warnings) || !Number.isSafeInteger(errors)) {
    throw new Error("Oxlint emitted invalid diagnostic counts");
  }
  return { warnings, errors };
}

export function enforceOxlintBudget(output, budget = maxAllowedWarnings) {
  if (!Number.isSafeInteger(budget) || budget < 0) {
    throw new Error("Oxlint warning budget must be a nonnegative safe integer");
  }
  const counts = parseOxlintSummary(output);
  if (counts.errors !== 0) {
    throw new Error(`Oxlint reported ${counts.errors} errors`);
  }
  if (counts.warnings > budget) {
    throw new Error(
      `Oxlint warning ratchet exceeded: ${counts.warnings} > ${budget}. Fix warnings rather than raise the cap.`,
    );
  }
  return counts;
}

function run() {
  // npm-run adds the pinned local node_modules/.bin to PATH. No global or
  // unreviewed linter fallback is permitted.
  const result = spawnSync("oxlint", [], {
    cwd: frontendRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `Oxlint command failed (status=${result.status ?? "missing"}, signal=${result.signal ?? "none"}): ${result.error?.message ?? "see diagnostic output"}`,
    );
  }
  const counts = enforceOxlintBudget((result.stdout ?? "") + "\n" + (result.stderr ?? ""));
  process.stdout.write(
    `Oxlint warning ratchet: ${counts.warnings}/${maxAllowedWarnings} warnings, 0 errors.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`Lint gate failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
