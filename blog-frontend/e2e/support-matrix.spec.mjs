import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

const supportRoutes = [
  { path: "/admin/categories", endpoint: "/api/admin/categories" },
  { path: "/admin/tags", endpoint: "/api/admin/tags" },
  { path: "/admin/comments", endpoint: "/api/admin/comments" },
  { path: "/admin/notifications", endpoint: "/api/me/notifications" },
  { path: "/admin/media", endpoint: "/api/admin/media" },
  { path: "/admin/settings", endpoint: "/api/admin/settings" },
  { path: "/admin/users", endpoint: "/api/admin/members" },
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

for (const viewport of viewports) {
  for (const theme of ["light", "dark"]) {
    for (const routeCase of supportRoutes) {
      test(`${routeCase.path} ${viewport.name}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setTheme(page, theme);

        const consoleProblems = [];
        page.on("console", (message) => {
          if (message.type() === "error" || message.type() === "warning") {
            consoleProblems.push(`${message.type()}: ${message.text()}`);
          }
        });
        page.on("pageerror", (error) => {
          consoleProblems.push(`pageerror: ${error.message}`);
        });

        const unknown = await installApiFixtures(page);
        const dataResponse = page.waitForResponse((response) => {
          return new URL(response.url()).pathname === routeCase.endpoint;
        });

        await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
        await dataResponse;

        await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("data-brand", "blog-admin");
        await expect(page.getByText("正在验证权限")).toHaveCount(0);

        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth > root.clientWidth + 1;
        });
        expect(overflow).toBe(false);
        expect(unknown).toEqual([]);
        expect(consoleProblems).toEqual([]);

        const fileName = `${routeCase.path.replaceAll("/", "-").replace(/^-/, "")}-${viewport.name}-${theme}.png`;
        const screenshotPath = testInfo.outputPath(fileName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach("render", {
          path: screenshotPath,
          contentType: "image/png",
        });
      });
    }
  }
}
