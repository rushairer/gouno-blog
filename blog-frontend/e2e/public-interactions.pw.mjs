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

async function openPublic(
  page,
  path,
  viewport = { width: 1440, height: 900 },
  fixtureOptions = {},
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem("gouno-blog:locale", "zh");
  });
  await setTheme(page, "light");
  const problems = collectConsoleProblems(page);
  const unknown = await installPublicApiFixtures(page, fixtureOptions);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#public-main")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browser Acceptance Blog 首页" }),
  ).toBeVisible();
  return { problems, unknown };
}

function expectClean(
  { problems, unknown },
  { allowInjected503 = false } = {},
) {
  const unexpectedProblems = allowInjected503
    ? problems.filter(
        (problem) =>
          !/^error: Failed to load resource: the server responded with a status of 503\b/.test(
            problem,
          ),
      )
    : problems;
  expect(unknown).toEqual([]);
  expect(unexpectedProblems).toEqual([]);
}

test("mobile public drawer navigates discovery routes and closes", async ({ page }) => {
  const state = await openPublic(page, "/", { width: 390, height: 844 });

  await page.getByRole("button", { name: "打开主导航" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "移动导航" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "分类" }).click();

  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  expectClean(state);
});

test("public shell search preserves canonical Articles active route", async ({ page }) => {
  const state = await openPublic(page, "/");

  const search = page.getByRole("textbox", { name: "搜索文章" });
  await search.fill("OAuth2");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=OAuth2$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expectClean(state);
});

test("discovery failure is recoverable and never masquerades as Empty", async ({ page }) => {
  const failures = new Set(["GET /api/categories"]);
  const state = await openPublic(page, "/categories", undefined, { fail: failures });

  await expect(page.getByText("分类加载失败")).toBeVisible();
  await expect(page.getByText(/暂无分类|还没有分类/)).toHaveCount(0);

  failures.delete("GET /api/categories");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "工程实践" }),
  ).toBeVisible();
  expectClean(state, { allowInjected503: true });
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

test("article transport failure is recoverable and never masquerades as NotFound", async ({ page }) => {
  const failures = new Set(["GET /api/posts/canonical-oauth2"]);
  const state = await openPublic(page, "/articles/canonical-oauth2", undefined, {
    fail: failures,
    anonymous: true,
  });

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByText(/文章不存在|404/)).toHaveCount(0);

  failures.delete("GET /api/posts/canonical-oauth2");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "OAuth2 与 BFF：把浏览器边界重新画清楚",
    }),
  ).toBeVisible();
  expect(state.unknown).toEqual([]);
  expect(state.problems.filter((problem) => problem.startsWith("pageerror:"))).toEqual(
    [],
  );
});

test("article TOC keeps real hash navigation and Core CodeBlock owns copy feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  const state = await openPublic(page, "/articles/canonical-oauth2");

  const toc = page.getByRole("navigation", { name: "文章目录" });
  await toc.getByRole("link", { name: "为什么重新画边界" }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe("");

  const copy = page.getByRole("button", { name: "复制代码" });
  await copy.click();
  await expect(page.getByRole("button", { name: /已复制/ })).toBeVisible();
  expectClean(state);
});

test("article community like and comment mutations preserve the reading surface", async ({ page }) => {
  const state = await openPublic(page, "/articles/canonical-oauth2");

  const like = page.getByRole("button", { name: /11 点赞/ });
  await like.click();
  await expect(page.getByRole("button", { name: /12 点赞/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const comment = page.getByRole("textbox", { name: "评论" });
  await comment.fill("Rendered community mutation fixture");
  await page.getByRole("button", { name: "发布评论" }).click();
  await expect(page.getByText("Rendered community mutation fixture")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "OAuth2 与 BFF：把浏览器边界重新画清楚",
    }),
  ).toBeVisible();
  expectClean(state);
});

test("article report failure stays inside the report modal", async ({ page }) => {
  const state = await openPublic(page, "/articles/canonical-oauth2", undefined, {
    fail: new Set(["POST /api/comments/101/report"]),
  });

  await page.getByRole("button", { name: "举报" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Browser fixture report failure");
  await dialog.getByRole("button", { name: "举报" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Fixture Reader")).toBeVisible();
  expectClean(state, { allowInjected503: true });
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

test("custom page transport failure is recoverable and never masquerades as NotFound", async ({ page }) => {
  const failures = new Set(["GET /api/pages/links"]);
  const state = await openPublic(page, "/links", undefined, { fail: failures });

  await expect(page.getByRole("heading", { level: 1, name: "页面载入失败" })).toBeVisible();
  await expect(page.getByText(/页面不存在|404/)).toHaveCount(0);

  failures.delete("GET /api/pages/links");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "常用链接" }),
  ).toBeVisible();
  expectClean(state, { allowInjected503: true });
});

test("account notifications mark-one failure preserves the loaded list", async ({ page }) => {
  const state = await openPublic(page, "/account/notifications", undefined, {
    fail: new Set(["PUT /api/me/notifications/301/read"]),
  });

  await expect(page.getByText("Fixture Reader 回复了你的评论")).toBeVisible();
  await page
    .getByRole("button", { name: "标为已读", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Fixture Reader 回复了你的评论")).toBeVisible();
  expectClean(state, { allowInjected503: true });
});

test("account notifications support the real mark-all mutation", async ({ page }) => {
  const state = await openPublic(page, "/account/notifications");

  const markAll = page.getByRole("button", { name: "全部标为已读" });
  await expect(markAll).toBeEnabled();
  await markAll.click();
  await expect(markAll).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "标为已读", exact: true }),
  ).toHaveCount(0);
  expectClean(state);
});

test("account settings remains an identity handoff instead of a Blog security form", async ({ page }) => {
  const state = await openPublic(page, "/account/settings");
  const main = page.locator("#public-main");

  await expect(
    main.getByRole("heading", { level: 1, name: "账号设置" }),
  ).toBeVisible();
  await expect(main.getByText(/GOSSO Admin 管理/)).toBeVisible();
  await expect(main.getByRole("textbox")).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: /密码|MFA|Passkey/ }),
  ).toHaveCount(0);
  expectClean(state);
});

test("NotFound canonical navigation returns to a public route", async ({ page }) => {
  const state = await openPublic(page, "/missing/route");

  await page.getByRole("link", { name: "全部文章", exact: true }).click();
  await expect(page).toHaveURL(/\/articles$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "全部文章" }),
  ).toBeVisible();
  expectClean(state);
});
