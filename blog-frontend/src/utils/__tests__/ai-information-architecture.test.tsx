import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminNavigation } from "../navigation";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Blog Admin AI information architecture", () => {
  it("exposes AI Operations and AI Settings as sibling top-level destinations", () => {
    const aiGroup = adminNavigation.find((group) => group.label === "AI");
    expect(aiGroup?.items.map((item) => item.path)).toEqual([
      "/admin/ai-ops",
      "/admin/ai-settings",
    ]);
    expect(
      aiGroup?.items.every((item) => item.permissions?.includes("ai.manage")),
    ).toBe(true);

    const interactionGroup = adminNavigation.find(
      (group) => group.label === "互动管理",
    );
    expect(
      interactionGroup?.items.some((item) =>
        item.path.startsWith("/admin/ai-"),
      ),
    ).toBe(false);
  });

  it("keeps both AI destinations permission-gated in the router", () => {
    const appSource = source("src/App.tsx");

    expect(appSource).toContain('path="/admin/ai-ops"');
    expect(appSource).toContain('path="/admin/ai-settings"');
    expect(appSource).toContain('import("./pages/admin/AISettings")');
    const aiGateCount = appSource.match(
      /requiredPermissions=\{\["ai\.manage"\]\}/g,
    )?.length;
    expect(aiGateCount).toBe(2);
  });

  it("keeps stable configuration code out of AI Operations", () => {
    const operationsSource = source("src/pages/admin/AIOperations.tsx");

    expect(operationsSource).not.toContain("AdvancedWorkspace");
    expect(operationsSource).not.toContain("getProviderProfiles");
    expect(operationsSource).not.toContain("getEmbeddingProfiles");
    expect(operationsSource).not.toContain("getIndexStatus");
    expect(operationsSource).not.toContain("getAgentSkills");
    expect(operationsSource).toContain('params.get("tab") !== "advanced"');
    expect(operationsSource).toContain("/admin/ai-settings");
  });
});
