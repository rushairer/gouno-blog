import { expect, test } from "@playwright/test";
import { installAiFixtures, prepareAiBrowserState } from "./ai-mock-api.mjs";

function run(id, summary = `List summary ${id}`) {
  return {
    id, agent_id: 1, status: "succeeded", trigger_type: "manual",
    provider: "test", model: "test-model", input_tokens: 1, output_tokens: 2,
    created_at: "2026-10-23T00:00:00Z",
    started_at: "2026-10-23T00:00:00Z", output_summary: summary,
  };
}

async function openControlledConsole(page, width = 1440, theme = "light") {
  await page.setViewportSize({ width, height: 900 });
  await prepareAiBrowserState(page, theme);
  const health = await installAiFixtures(page);
  const pending = new Map();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/api\/admin\/agent-runs(?:\/\d+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const match = /\/(\d+)$/.exec(path);
    if (!match) {
      return route.fulfill({ json: { data: { list: [run(101), run(102)] } } });
    }
    const id = Number(match[1]);
    pending.set(id, [...(pending.get(id) || []), route]);
  });
  await page.goto("/admin/ai-ops?tab=records&record=agent");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  async function response(id, summary, index = 0) {
    await expect.poll(() => pending.get(id)?.length || 0).toBeGreaterThan(index);
    const finished = page.waitForResponse((item) =>
      new URL(item.url()).pathname === `/api/admin/agent-runs/${id}`,
    );
    await pending.get(id)[index].fulfill({
      json: { data: { run: run(id, summary), tool_calls: [] } },
    });
    await (await finished).finished();
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }

  function healthy() {
    expect(health.unknown).toEqual([]);
    expect(health.unexpectedWrites).toEqual([]);
    expect(errors).toEqual([]);
  }
  return { pending, response, healthy };
}

async function screenshot(page, testInfo, name) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )).toBe(false);
  const path = testInfo.outputPath(`${name}.png`);
  // Complete finite CSS transitions rather than certifying an intermediate tint.
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const [name, width, theme] of [["desktop", 1440, "light"], ["mobile", 390, "dark"]]) {
  test(`${name}: late Agent detail cannot replace the selected record`, async ({ page }, testInfo) => {
    const state = await openControlledConsole(page, width, theme);
    await expect.poll(() => state.pending.get(101)?.length || 0).toBe(1);
    await page.getByRole("button", { name: "Inspect Run #102" }).click();
    await state.response(102, "Current selected detail");
    await expect(page.getByRole("heading", { name: /Run #102/ })).toBeVisible();
    await state.response(101, "Obsolete previous detail");
    await expect(page.getByRole("heading", { name: /Run #102/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Run #101/ })).toHaveCount(0);
    await expect(page.locator(".agent-output")).toHaveText("Current selected detail");
    // The mobile detail pane intentionally hides, but does not unmount, its rail.
    await expect(page.getByRole("button", { name: "Inspect Run #101", includeHidden: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Inspect Run #102", includeHidden: true })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("run")).toBe("102");
    state.healthy();
    await screenshot(page, testInfo, `agent-detail-order-${name}`);
  });
}

test("a new pending selection hides previous actionable detail", async ({ page }, testInfo) => {
  const state = await openControlledConsole(page);
  await state.response(101, "Previously loaded detail");
  await expect(page.getByRole("heading", { name: /Run #101/ })).toBeVisible();
  await page.getByRole("button", { name: "Inspect Run #102" }).click();
  await expect.poll(() => state.pending.get(102)?.length || 0).toBe(1);
  await expect(page.getByRole("heading", { name: /Run #101/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete record", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspect Run #101" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Inspect Run #102" })).toHaveAttribute("aria-pressed", "false");
  await screenshot(page, testInfo, "agent-detail-pending");
  await state.response(102, "Fresh selected detail");
  await page.getByRole("button", { name: "Agent runs", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Run #102/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect Run #102" })).toHaveAttribute("aria-pressed", "true");
  expect(state.pending.get(102)).toHaveLength(1);
  state.healthy();
});

test("returning to Agent records does not revive a previous context response", async ({ page }, testInfo) => {
  const state = await openControlledConsole(page);
  await expect.poll(() => state.pending.get(101)?.length || 0).toBe(1);
  await page.getByRole("button", { name: "Workflow tasks", exact: true }).click();
  await page.getByRole("button", { name: "Agent runs", exact: true }).click();
  await state.response(101, "Current context detail", 1);
  await state.response(101, "Abandoned context detail", 0);
  await expect(page.locator(".agent-output")).toHaveText("Current context detail");
  state.healthy();
  await screenshot(page, testInfo, "agent-detail-context-return");
});
