import { expect, test } from "@playwright/test";
import { setTheme } from "./mock-api.mjs";
import { installPublicApiFixtures } from "./public-mock-api.mjs";

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

async function openPublic(page, path, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await setTheme(page, "light");
  const problems = collectConsoleProblems(page);
  const unknown = await installPublicApiFixtures(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#public-main")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browser Acceptance Blog 首页" }),
  ).toBeVisible();
  return { problems, unknown };
}

function expectClean({ problems, unknown }) {
  expect(unknown).toEqual([]);
  expect(problems).toEqual([]);
}

test("mobile public drawer navigates discovery routes and closes", async ({ page }) => {
  const state = await openPublic(page, "/", { width: 390, height: 844 });

  await page.getByRole("button", { name: "打开主导航" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "移动导航" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "分类" }).click();

  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("heading", { level: 1, name: "分类" })).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  expectClean(state);
});

test("public shell search preserves canonical Articles active route", async ({ page }) => {
  const state = await openPublic(page, "/");

  await page.getByRole("textbox", { name: "搜索文章" }).fill("OAuth2");
  await page.getByRole("button", { name: "提交搜索" }).click();

  await expect(page).toHaveURL(/\/search\?q=OAuth2$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "“OAuth2”的搜索结果" }),
  ).toBeVisible();
  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await expect(mainNavigation.getByRole("link", { name: "文章" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expectClean(state);
});

test("article index tag filter navigates through the shared route family", async ({ page }) => {
  const state = await openPublic(page, "/articles", { width: 1024, height: 768 });

  const filters = page.getByRole("region", { name: "筛选" });
  await filters.getByRole("link", { name: "OAuth2" }).click();

  await expect(page).toHaveURL(/\/tags\/OAuth2$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "标签：OAuth2" }),
  ).toBeVisible();
  expectClean(state);
});

test("article detail stays contained on phone width and related navigation works", async ({ page }) => {
  const state = await openPublic(page, "/articles/canonical-oauth2", {
    width: 390,
    height: 844,
  });

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "OAuth2 与 BFF：把浏览器边界重新画清楚",
    }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);

  await page
    .getByRole("link", { name: "React 页面如何避免历史 CSS 污染" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/articles\/react-css-ownership$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "React 页面如何避免历史 CSS 污染",
    }),
  ).toBeVisible();
  expectClean(state);
});

test("runtime custom navigation reaches a real custom page", async ({ page }) => {
  const state = await openPublic(page, "/");

  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await mainNavigation.getByRole("link", { name: "常用链接" }).click();

  await expect(page).toHaveURL(/\/links$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "常用链接" }),
  ).toBeVisible();
  expectClean(state);
});
