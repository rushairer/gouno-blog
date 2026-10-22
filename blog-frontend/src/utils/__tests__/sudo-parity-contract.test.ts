import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];
const script = "scripts/check-privileged-access-parity.mjs";
const sources = [
  "components/auth/SudoGate.tsx",
  "hooks/useSudoMode.ts",
  "hooks/sudo-session-store.ts",
  "components/auth/StepUpMfaModal.tsx",
  "api/client.ts",
  "pages/admin/Users.tsx",
  "pages/admin/SiteSettings.tsx",
  "components/agent/AdvancedWorkspace.tsx",
  "components/agent/KnowledgeWorkspace.tsx",
];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "sudo-parity-"));
  fixtures.push(root);
  const paths = [script, ...sources.map((file) => `src/${file}`)];
  for (const relativePath of paths) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.resolve(relativePath), target);
  }
  return root;
}

function run(root: string) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error) throw result.error;
  return result;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("privileged-access shared-store contract", () => {
  it("accepts the actual hook, store and unchanged canonical surfaces", () => {
    const result = run(fixture());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("parity contract passed");
  });

  it.each([
    [
      "hook subscription",
      "hooks/useSudoMode.ts",
      "    subscribeSudo,",
      "must subscribe to the shared sudo snapshot",
    ],
    [
      "store import",
      "hooks/useSudoMode.ts",
      'from "./sudo-session-store";',
      "must bind the canonical shared sudo store",
    ],
    [
      "stale listener",
      "hooks/sudo-session-store.ts",
      "window.addEventListener(SUDO_SESSION_STALE_EVENT, markStale);",
      "must subscribe to the backend-rejection presentation event",
    ],
    [
      "stale listener cleanup",
      "hooks/sudo-session-store.ts",
      "window.removeEventListener(SUDO_SESSION_STALE_EVENT, markStale);",
      "must release the shared stale-state listener",
    ],
  ])("rejects a missing %s", (_name, sourcePath, needle, expected) => {
    const root = fixture();
    const target = path.join(root, "src", sourcePath);
    const source = readFileSync(target, "utf8");
    expect(source).toContain(needle);
    writeFileSync(target, source.replace(needle, "/* regression probe */"));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
  });
});
