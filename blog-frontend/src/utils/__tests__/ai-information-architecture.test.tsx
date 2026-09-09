import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { adminNavigation } from "../navigation";

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
      interactionGroup?.items.some((item) => item.path.startsWith("/admin/ai-")),
    ).toBe(false);
  });

  it("keeps both AI destinations permission-gated in the router", () => {
    const appSource = readFileSync(
      fileURLToPath(new URL("../../App.tsx", import.meta.url)),
      "utf8",
    );

    expect(appSource).toContain('path="/admin/ai-ops"');
    expect(appSource).toContain('path="/admin/ai-settings"');
    expect(appSource).toContain('import("./pages/admin/AISettings")');
    expect(appSource.match(/requiredPermissions=\{\["ai\.manage"\]\}/g)?.length).toBe(
      2,
    );
  });
});
