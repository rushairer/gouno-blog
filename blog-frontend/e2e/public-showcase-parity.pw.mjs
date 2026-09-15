import { expect, test } from "@playwright/test";
import { setTheme } from "./mock-api.mjs";
import { installPublicApiFixtures } from "./public-mock-api.mjs";
import {
  expectGeometryParity,
  expectStyleParity,
  pairScreenshot,
} from "./showcase-parity-helpers.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";
const productOrigin = "http://127.0.0.1:4173";

const routes = [
  {
    name: "home",
    fixture: "blog-home",
    path: "/",
    surface: "article",
  },
  {
    name: "articles",
    fixture: "blog-articles",
    path: "/articles",
    surface: '[aria-label="筛选"]',
  },
  {
    name: "search",
    fixture: "blog-search",
    path: "/search?q=OAuth2",
    surface: '[aria-label="筛选"]',
  },
  {
    name: "categories",
    fixture: "blog-categories",
    path: "/categories",
    surface: '[data-slot="card"]',
  },
  {
    name: "tags",
    fixture: "blog-tags",
    path: "/tags",
    surface: '[data-slot="card"]',
  },
  {
    name: "archive",
    fixture: "blog-archive",
    path: "/archive",
    surface: '[data-slot="card"]',
  },
  {
    name: "article-detail",
    fixture: "blog-article-detail",
    path: "/articles/canonical-oauth2",
    surface: 'article[data-slot="card"]',
  },
  {
    name: "about",
    fixture: "blog-about",
    path: "/about",
    surface: 'article[data-slot="card"]',
  },
  {
    name: "custom-page",
    fixture: "blog-custom-page",
    path: "/design-system",
    surface: 'article[data-slot="card"]',
    surfaceWidthParity: false,
  },
  {
    name: "account-notifications",
    fixture: "blog-account-notifications",
    path: "/account/notifications",
    surface: '[data-slot="card"]',
  },
  {
    name: "account-settings",
    fixture: "blog-account-settings",
    path: "/account/settings",
    surface: '[data-slot="card"]',
  },
  {
    name: "not-found",
    fixture: "blog-not-found",
    path: "/missing/route",
    surface: '[data-slot="card"]',
  },
];

async function openPublicPair(browser, fixtureId, productPath, theme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const showcase = await context.newPage();
  const product = await context.newPage();

  await product.addInitScript(() => {
    localStorage.setItem("gouno-blog:locale", "zh");
  });
  await setTheme(showcase, theme);
  await setTheme(product, theme);
  const unknown = await installPublicApiFixtures(product);

  await showcase.goto(
    `${showcaseOrigin}/?embedded=1&workspace=blog&brand=blog#${fixtureId}`,
    { waitUntil: "networkidle" },
  );
  await product.goto(`${productOrigin}${productPath}`, {
    waitUntil: "networkidle",
  });

  await expect(showcase.locator("#public-main")).toBeVisible();
  await expect(product.locator("#public-main")).toBeVisible();

  return { context, showcase, product, unknown };
}

async function expectPublicShellParity(showcase, product) {
  const showcaseHeader = showcase
    .getByRole("navigation", { name: "主导航" })
    .locator("xpath=ancestor::header[1]");
  const productHeader = product
    .getByRole("navigation", { name: "主导航" })
    .locator("xpath=ancestor::header[1]");

  await expectStyleParity(showcaseHeader, productHeader);
  await expectGeometryParity(showcaseHeader, productHeader, {
    width: true,
    height: true,
  });

  const showcaseMain = showcase.locator("#public-main");
  const productMain = product.locator("#public-main");
  await expectStyleParity(showcaseMain, productMain);
  await expectGeometryParity(showcaseMain, productMain, {
    width: true,
    height: false,
  });

  const showcaseHeading = showcaseMain.getByRole("heading", { level: 1 }).first();
  const productHeading = productMain.getByRole("heading", { level: 1 }).first();
  await expectStyleParity(showcaseHeading, productHeading);

  for (const page of [showcase, product]) {
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  }
}

for (const theme of ["light", "dark"]) {
  for (const route of routes) {
    test(`Public ${route.name} canonical surface matches Showcase (${theme})`, async ({
      browser,
    }, testInfo) => {
      const { context, showcase, product, unknown } = await openPublicPair(
        browser,
        route.fixture,
        route.path,
        theme,
      );

      await expectPublicShellParity(showcase, product);

      const showcaseSurface = showcase
        .locator("#public-main")
        .locator(route.surface)
        .first();
      const productSurface = product
        .locator("#public-main")
        .locator(route.surface)
        .first();
      await expectStyleParity(showcaseSurface, productSurface);
      await expectGeometryParity(showcaseSurface, productSurface, {
        width: route.surfaceWidthParity !== false,
        height: false,
      });

      if (route.name === "article-detail") {
        const showcaseAnchor = showcase.locator('[data-slot="anchor"]').first();
        const productAnchor = product.locator('[data-slot="anchor"]').first();
        await expectStyleParity(showcaseAnchor, productAnchor);

        const showcaseCommunity = showcase.locator(
          'section[aria-labelledby="article-community"]',
        );
        const productCommunity = product.locator(
          'section[aria-labelledby="article-community"]',
        );
        await expectStyleParity(showcaseCommunity, productCommunity);
        await expectGeometryParity(showcaseCommunity, productCommunity, {
          width: true,
          height: false,
        });
      }

      if (route.name === "custom-page") {
        await expect(
          product.getByRole("navigation", { name: "目录导航" }),
        ).toBeVisible();
        await expect(
          showcase.getByRole("navigation", { name: "目录导航" }),
        ).toHaveCount(0);
      }

      expect(unknown).toEqual([]);
      await pairScreenshot(
        showcase,
        product,
        `public-${route.name}-${theme}`,
        testInfo,
      );
      await context.close();
    });
  }
}
