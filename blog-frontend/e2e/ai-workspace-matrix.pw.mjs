import { expect, test } from "@playwright/test";
import { installAiFixtures, prepareAiBrowserState } from "./ai-mock-api.mjs";

const routeCases = [
  { name: "ops-overview", path: "/admin/ai-ops?tab=overview", heading: "AI Operations" },
  { name: "ops-inbox", path: "/admin/ai-ops?tab=inbox", heading: "AI Operations" },
  { name: "ops-automation", path: "/admin/ai-ops?tab=automation", heading: "AI Operations" },
  { name: "ops-agent-records", path: "/admin/ai-ops?tab=records&record=agent", heading: "AI Operations" },
  { name: "ops-workflow-records", path: "/admin/ai-ops?tab=records&record=workflow", heading: "AI Operations" },
  { name: "settings-agents", path: "/admin/ai-settings?section=agents", heading: "AI Settings" },
  { name: "settings-skills", path: "/admin/ai-settings?section=skills", heading: "AI Settings" },
  { name: "settings-tools", path: "/admin/ai-settings?section=tools", heading: "AI Settings" },
  { name: "settings-knowledge", path: "/admin/ai-settings?section=knowledge", heading: "AI Settings" },
  { name: "settings-providers", path: "/admin/ai-settings?section=providers", heading: "AI Settings" },
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

function captureConsoleProblems(page) {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function expectHealthyPage(page, theme) {
  await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("data-brand", "blog-admin");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.getByText("正在验证权限")).toHaveCount(0);
  expect((await page.title()).trim().length).toBeGreaterThan(0);

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

for (const viewport of viewports) {
  for (const theme of ["light", "dark"]) {
    for (const routeCase of routeCases) {
      test(`${routeCase.name} ${viewport.name}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await prepareAiBrowserState(page, theme);
        const consoleProblems = captureConsoleProblems(page);
        const fixtureState = await installAiFixtures(page);
        const agentsResponse = page.waitForResponse(
          (response) => new URL(response.url()).pathname === "/api/admin/agents",
        );

        await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
        await agentsResponse;
        await expect(page.getByRole("heading", { level: 1, name: routeCase.heading })).toBeVisible();
        await expectHealthyPage(page, theme);

        const current = new URL(page.url());
        expect(current.pathname).toBe(new URL(`http://fixture${routeCase.path}`).pathname);
        expect(fixtureState.unknown).toEqual([]);
        expect(fixtureState.unexpectedWrites).toEqual([]);
        expect(consoleProblems).toEqual([]);

        const screenshotPath = testInfo.outputPath(
          `${routeCase.name}-${viewport.name}-${theme}.png`,
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach("render", {
          path: screenshotPath,
          contentType: "image/png",
        });
      });
    }
  }
}
