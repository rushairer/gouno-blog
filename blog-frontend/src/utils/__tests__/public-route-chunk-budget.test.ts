import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = fs.readFileSync(resolve("src/App.tsx"), "utf8");
const budgetScript = resolve("scripts/check-bundle-chunk-budget.mjs");

describe("public route code splitting", () => {
  it("loads public pages only for the requested route", () => {
    const pages = [
      "Home",
      "ArticleIndex",
      "PostDetail",
      "Categories",
      "Tags",
      "Archive",
      "About",
      "NotFound",
      "CustomPageView",
    ];
    for (const name of pages) {
      const lazyImport = `React.lazy(() => import("./pages/${name}"))`;
      expect(app).toContain(lazyImport);
      expect(app).not.toContain(`import ${name} from "./pages/${name}";`);
    }
  });

  it("keeps the original loading shell and login boundaries", () => {
    expect(app).toContain("<PublicShell>");
    expect(app).toContain("<React.Suspense");
    expect(app).toContain('role="status"');
    expect(app).toContain('path="/articles/:slug"');
    expect(app).toContain('path="/:slug"');
    expect(app).toContain('path="/admin/ai-ops"');
    expect(app).toContain('path="/admin/ai-settings"');
    expect(app).toContain("<RequireAuth");
  });
});

function checkBudget(sizes: Record<string, number>) {
  const temp = fs.mkdtempSync(join(tmpdir(), "gouno-chunks-"));
  try {
    const assets = join(temp, "dist", "assets");
    fs.mkdirSync(assets, { recursive: true });
    for (const [name, bytes] of Object.entries(sizes)) {
      fs.writeFileSync(join(assets, name), Buffer.alloc(bytes));
    }
    return spawnSync(process.execPath, [budgetScript], {
      cwd: temp,
      encoding: "utf8",
      timeout: 5_000,
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

describe("emitted Vite chunk budget", () => {
  it("fails when the build has no JS output", () => {
    const result = checkBudget({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no JavaScript chunks");
  });

  it("accepts the exact 500 kB boundary", () => {
    const result = checkBudget({ "index.js": 500_000, "route.js": 12_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 JavaScript chunks <= 500 kB");
  });

  it("rejects oversized chunks even when renamed to vendor", () => {
    const result = checkBudget({
      "index.js": 12_000,
      "vendor.js": 500_001,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("vendor.js");
    expect(result.stderr).toContain("chunk budget exceeded");
  });
});
