import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

const routeCases = [
  { path: "/admin/dashboard", identity: "数据概览", structure: "page" },
  { path: "/admin/posts", identity: "文章", structure: "page" },
  { path: "/admin/pages", identity: "单页", structure: "page" },
  { path: "/admin/posts/new", identity: "返回文章列表", structure: "editor" },
  { path: "/admin/posts/101/edit", identity: "Browser Acceptance Post", structure: "editor" },
  { path: "/admin/pages/new", identity: "返回单页列表", structure: "editor" },
  { path: "/admin/pages/201/edit", identity: "Browser Acceptance Page", structure: "editor" },
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

for (const viewport of viewports) {
  for (const theme of ["light", "dark"]) {
    for (const routeCase of routeCases) {
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
        await page.goto(routeCase.path, { waitUntil: "networkidle" });

        await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("data-brand", "blog-admin");
        await expect(page.getByText("正在验证权限")).toHaveCount(0);

        if (routeCase.structure === "editor") {
          const editor = page.locator(".editor-page");
          await expect(editor).toBeVisible();
          await expect(editor.getByText(routeCase.identity, { exact: false }).first()).toBeVisible();
          await expect(page.locator(".editor-commandbar")).toBeVisible();
          await expect(editor.locator(":scope > [data-slot=card]")).toHaveCount(1);
        } else {
          const pageHeader = page.locator('[data-slot="page-header"]');
          await expect(pageHeader).toBeVisible();
          await expect(
            pageHeader.getByRole("heading", { level: 1, name: routeCase.identity }),
          ).toBeVisible();
        }

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
