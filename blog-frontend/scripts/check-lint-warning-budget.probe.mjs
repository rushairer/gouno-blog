import { strict as assert } from "node:assert";
import test from "node:test";
import { enforceOxlintBudget, maxAllowedWarnings, parseOxlintSummary } from "./check-lint-warning-budget.mjs";

test("accepts the exact lowered 65-warning baseline", () => {
  const result = enforceOxlintBudget("Found 65 warnings and 0 errors.");
  assert.deepEqual(result, { warnings: maxAllowedWarnings, errors: 0 });
});

test("detects the former 66-warning baseline and any regression", () => {
  assert.throws(() => enforceOxlintBudget("Found 66 warnings and 0 errors."), /warning ratchet exceeded/);
  assert.throws(() => enforceOxlintBudget("Found 200 warnings and 0 errors."), /warning ratchet exceeded/);
});

test("refuses a false green when no summary or duplicate summaries appear", () => {
  assert.throws(() => parseOxlintSummary("Everything passed!"), /recognizable summary/);
  assert.throws(
    () => parseOxlintSummary("Found 65 warnings and 0 errors.\nFound 0 warnings and 0 errors."),
    /recognizable summary/,
  );
});

test("detects errors even with a warning count below budget", () => {
  assert.throws(() => enforceOxlintBudget("Found 0 warnings and 1 error."), /reported 1 errors/);
});

test("accepts zero warnings and handles ANSI color escapes", () => {
  assert.deepEqual(enforceOxlintBudget("\x1b[32mFound 0 warnings and 0 errors.\x1b[0m"), { warnings: 0, errors: 0 });
});

test("refuses malformed, negative, and impossible warning budgets", () => {
  for (const budget of [-1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => enforceOxlintBudget("Found 0 warnings and 0 errors.", budget), /nonnegative safe integer/);
  }
});
