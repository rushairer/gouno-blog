import { expect, test } from "@playwright/test";
import { installAiFixtures, prepareAiBrowserState } from "./ai-mock-api.mjs";

function run(id) {
  return {
    id, agent_id: 1, status: "succeeded", trigger_type: "manual",
    provider: "test", model: "test-model", input_tokens: 1, output_tokens: 2,
    created_at: "2026-10-23T00:00:00Z",
    started_at: "2026-10-23T00:00:00Z",
    finished_at: "2026-10-23T00:00:02Z",
    output_summary: `Snapshot ${id}`,
  };
}

async function openControlledWorkspace(page, width, theme) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await prepareAiBrowserState(page, theme);
  const health = await installAiFixtures(page);
  const pending = [];
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.route(/\/api\/admin\/agent-runs(?:\/\d+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const detail = /\/(\d+)$/.exec(path);
    if (detail) {
      return route.fulfill({
        json: { data: { run: run(Number(detail[1])), tool_calls: [] } },
      });
    }
    pending.push(route);
  });
  await page.goto("/admin/ai-ops?tab=records&record=agent", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // main.tsx wraps the Vite development entry in StrictMode: keep the retired
  // setup's read (0) and the current setup's read (1) under explicit control.
  await expect.poll(() => pending.length).toBe(2);

  async function finish(index, ids) {
    await expect.poll(() => pending.length).toBeGreaterThan(index);
    const route = pending[index];
    const response = page.waitForResponse((item) => item.request() === route.request());
    await route.fulfill({ json: { data: { list: ids.map(run) } } });
    await (await response).finished();
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }
  async function refresh(expectedCount) {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(() => pending.length).toBe(expectedCount);
  }
  function healthy() {
    expect(health.unknown).toEqual([]);
    expect(health.unexpectedWrites).toEqual([]);
    expect(problems).toEqual([]);
  }
  return { finish, refresh, healthy };
}

async function screenshot(page, testInfo, name) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )).toBe(false);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const [name, width, theme] of [["desktop", 1440, "light"], ["mobile", 390, "dark"]]) {
  test(`${name}: newer workspace refresh owns initial loading and snapshot`, async ({ page }, testInfo) => {
    const state = await openControlledWorkspace(page, width, theme);
    const loading = page.getByRole("status", { name: /Loading AI Agent workspace/ });
    await expect(loading).toBeVisible();
    await state.refresh(3);
    await state.finish(2, [202]);
    await expect(loading).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inspect Run #202", exact: true })).toBeVisible();
    // Both initial reads remain pending: the new refresh must unblock the UI itself.
    await screenshot(page, testInfo, `refresh-initial-superseded-${name}`);
    await state.finish(1, [101]);
    await state.finish(0, [901]);
    await expect(page.getByRole("button", { name: "Inspect Run #101", includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inspect Run #901", includeHidden: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Inspect Run #202", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Run #202/ })).toBeVisible();
    await expect(page.locator(".agent-output")).toHaveText("Snapshot 202");
    state.healthy();
    await screenshot(page, testInfo, `refresh-initial-current-${name}`);
  });

  test(`${name}: late workspace refresh cannot overwrite the latest collection`, async ({ page }, testInfo) => {
    const state = await openControlledWorkspace(page, width, theme);
    await state.finish(1, [101]);
    await expect(page.getByRole("button", { name: "Inspect Run #101", exact: true })).toBeVisible();
    await state.finish(0, [901]);
    await expect(page.getByRole("button", { name: "Inspect Run #901", includeHidden: true })).toHaveCount(0);
    await state.refresh(3);
    await state.refresh(4);
    // Retain the selected record while the surrounding collection changes.
    await state.finish(3, [101, 303]);
    await expect(page.getByRole("button", { name: "Inspect Run #303", exact: true })).toBeVisible();
    await state.finish(2, [101, 202]);
    await expect(page.getByRole("button", { name: "Inspect Run #303", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inspect Run #202", includeHidden: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Inspect Run #303", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Run #303/ })).toBeVisible();
    await expect(page.locator(".agent-output")).toHaveText("Snapshot 303");
    state.healthy();
    await screenshot(page, testInfo, `refresh-latest-collection-${name}`);
  });
}
