import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
const budgetCheck = resolve("scripts/check-bundle-chunk-budget.mjs");

describe("public route lazy-loading boundary", () => {
  it("keeps public pages out of the eagerly downloaded App entry", () => {
    for (const name of [
      "Home",
      "ArticleIndex",
      "PostDetail",
      "Categories",
      "Tags",
      "Archive",
      "About",
      "NotFound",
      "CustomPageView",
    ]) {
      expect(appSource).toContain(
        `const ${name} = React.lazy(() => import("./pages/${name}"));`,
      );
      expect(appSource).not.toContain(
        `import ${name} from "./pages/${name}";`,
      );
    }
  });

  it("preserves the PublicShell and existing spinner fallback under Suspense", () => {
    expect(appSource).toContain("<PublicShell>");
    expect(appSource).toContain("<React.Suspense");
    expect(appSource).toContain('role="status"');
    expect(appSource).toContain('path="/articles/:slug"');
    expect(appSource).toContain('path="/:slug"');
    expect(appSource).toContain('path="/admin/ai-ops"');
    expect(appSource).toContain('path="/admin/ai-settings"');
    expect(appSource).toContain("<RequireAuth");
  });
});

describe("emitted JavaScript chunk-size gate", () => {
  function runWithChunks(sizes: Record<string, number>) {
    const tmp = mkdtempSync(join(tmpdir(), "gouno-blog-chunk-budget-"));
    try {
      const assets = join(tmp, "dist", "assets");
      mkdirSync(assets, { recursive: true });
      for (const [name, bytes] of Object.entries(sizes)) {
        writeFileSync(join(assets, name), Buffer.alloc(bytes, 0x61));
      }
      return spawnSync(process.execPath, [budgetCheck], {
        cwd: tmp,
        encoding: "utf8",
        timeout: 5_000,
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  it("rejects missing build output rather than false-passing", () => {
    const result = runWithChunks({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no JavaScript chunks");
  });

  it("accepts emitted chunks at the exact established 500 kB boundary", () => {
    const result = runWithChunks({
      "index-test.js": 500_000,
      "editor-test.js": 32_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 JavaScript chunks <= 500 kB");
  });

  it("rejects oversized renamed/vendor chunks, not just index.js", () => {
    const result = runWithChunks({
      "index-ok.js": 12_000,
      "vendor-oversized.js": 500_001,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("vendor-oversized.js");
    expect(result.stderr).toContain("chunk budget exceeded");
  });
});
