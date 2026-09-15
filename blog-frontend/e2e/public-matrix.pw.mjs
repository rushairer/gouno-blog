import { expect, test } from "@playwright/test";
import { setTheme } from "./mock-api.mjs";
import { installPublicApiFixtures } from "./public-mock-api.mjs";

const publicRoutes = [
  { path: "/", heading: null },
  { path: "/articles", heading: null },
  { path: "/search?q=OAuth2", heading: null },
  { path: "/tags/OAuth2", heading: null },
  { path: "/categories/engineering", heading: null },
  { path: "/categories", heading: null },
  { path: "/tags", heading: null },
  { path: "/archive", heading: null },
  { path: "/about", heading: null },
  { path: "/links", heading: null },
  { path: "/articles/canonical-oauth2", heading: null },
  { path: "/missing/route", heading: null },
  { path: "/account/notifications", heading: "通知" },
  { path: "/account/settings", heading: "账号设置" },
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
    for (const route of publicRoutes) {
      const { path, heading } = route;
      test(`${path} ${viewport.name}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(() => {
          localStorage.setItem("gouno-blog:locale", "zh");
        });
        await setTheme(page, theme);
        const problems = collectConsoleProblems(page);
        const unknown = await installPublicApiFixtures(page);

        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#public-main")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        if (heading) {
          await expect(
            page.getByRole("heading", { level: 1, name: heading }),
          ).toBeVisible();
          await expect(page.getByText("正在跳转到登录...")).toHaveCount(0);
        }
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
