import { expect, test } from "@playwright/test";
import { setTheme } from "./mock-api.mjs";
import { installPublicApiFixtures } from "./public-mock-api.mjs";

const publicRoutes = [
  "/",
  "/articles",
  "/search?q=OAuth2",
  "/tags/OAuth2",
  "/categories/engineering",
  "/categories",
  "/tags",
  "/archive",
  "/about",
  "/links",
  "/articles/canonical-oauth2",
  "/missing/route",
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

function collectConsoleProblems(page) {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

for (const viewport of viewports) {
  for (const theme of ["light", "dark"]) {
    for (const path of publicRoutes) {
      test(`${path} ${viewport.name}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setTheme(page, theme);
        const problems = collectConsoleProblems(page);
        const unknown = await installPublicApiFixtures(page);

        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#public-main")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Browser Acceptance Blog 首页" }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("data-brand", "blog");

        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth > root.clientWidth + 1;
        });
        expect(overflow).toBe(false);
        expect(unknown).toEqual([]);
        expect(problems).toEqual([]);

        const routeName =
          path === "/"
            ? "home"
            : path
                .replace(/^\//, "")
                .replace(/[/?=&]+/g, "-")
                .replace(/-+$/g, "");
        const screenshotPath = testInfo.outputPath(
          `public-${routeName}-${viewport.name}-${theme}.png`,
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
