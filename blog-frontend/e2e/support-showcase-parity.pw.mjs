import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";
import {
  expectStyleParity,
  pairScreenshot,
} from "./showcase-parity-helpers.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";
const productOrigin = "http://127.0.0.1:4173";

async function openPair(
  browser,
  fixtureId,
  productPath,
  theme,
  { activeSudo = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const showcase = await context.newPage();
  const product = await context.newPage();

  await setTheme(showcase, theme);
  await setTheme(product, theme);
  await product.addInitScript(
    ({ sudo }) => {
      localStorage.setItem("gouno-blog:locale", "zh");
      if (sudo) {
        localStorage.setItem("gouno:sudo_activated_at", Date.now().toString());
      } else {
        localStorage.removeItem("gouno:sudo_activated_at");
      }
    },
    { sudo: activeSudo },
  );

  const unknown = await installApiFixtures(product);
  await showcase.goto(
    `${showcaseOrigin}/?embedded=1&workspace=blog-admin&brand=blog-admin#${fixtureId}`,
    { waitUntil: "networkidle" },
  );
  await product.goto(`${productOrigin}${productPath}`, {
    waitUntil: "networkidle",
  });

  return { context, showcase, product, unknown };
}

async function expectNoHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

for (const theme of ["light", "dark"]) {
  test(`Categories collection typography matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-categories",
      "/admin/categories",
      theme,
    );

    const showcaseRow = showcase.getByRole("row").nth(1);
    const productRow = product.getByRole("row").nth(1);
    await expectStyleParity(showcaseRow, productRow);
    for (const selector of [
      "td:nth-child(2) span",
      "td:nth-child(3) strong",
      "td:nth-child(3) span",
      "td:nth-child(4) code",
      "td:nth-child(5)",
    ]) {
      await expectStyleParity(
        showcaseRow.locator(selector),
        productRow.locator(selector),
      );
    }

    expect(unknown).toEqual([]);
    await expectNoHorizontalOverflow(product);
    await pairScreenshot(showcase, product, `support-categories-${theme}`, testInfo);
    await context.close();
  });

  test(`Tags collection Card matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-tags",
      "/admin/tags",
      theme,
    );

    const showcaseCard = showcase
      .locator('[data-slot="card"]')
      .filter({ has: showcase.getByRole("checkbox") })
      .first();
    const productCard = product
      .locator('[data-slot="card"]')
      .filter({ has: product.getByRole("checkbox") })
      .first();
    await expectStyleParity(showcaseCard, productCard);
    await expectStyleParity(
      showcaseCard.locator("strong"),
      productCard.locator("strong"),
    );

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-tags-${theme}`, testInfo);
    await context.close();
  });

  test(`Comments moderation Card matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-comments",
      "/admin/comments",
      theme,
    );

    const showcaseCard = showcase.getByRole("listitem").first();
    const productCard = product.getByRole("listitem").first();
    await expectStyleParity(showcaseCard, productCard);
    for (const selector of [
      ".type-body-sm.type-weight-semibold.text-primary",
      "strong",
      "time",
      "p",
    ]) {
      await expectStyleParity(
        showcaseCard.locator(selector).first(),
        productCard.locator(selector).first(),
      );
    }

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-comments-${theme}`, testInfo);
    await context.close();
  });

  test(`Notifications filter and object Card match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-notifications",
      "/admin/notifications",
      theme,
    );

    const showcaseFilter = showcase
      .getByRole("combobox", { name: "通知状态筛选" })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const productFilter = product
      .getByRole("combobox", { name: "通知状态筛选" })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    await expectStyleParity(showcaseFilter, productFilter);

    const showcaseCard = showcase.getByRole("listitem").first();
    const productCard = product.getByRole("listitem").first();
    await expectStyleParity(showcaseCard, productCard);
    await expectStyleParity(
      showcaseCard.locator("strong"),
      productCard.locator("strong"),
    );
    await expectStyleParity(
      showcaseCard.locator("time"),
      productCard.locator("time"),
    );

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-notifications-${theme}`, testInfo);
    await context.close();
  });

  test(`Media asset Card matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-media-library",
      "/admin/media",
      theme,
    );

    const showcaseCard = showcase.getByRole("listitem").first();
    const productCard = product.getByRole("listitem").first();
    await expectStyleParity(showcaseCard, productCard);
    await expectStyleParity(
      showcaseCard.locator("strong"),
      productCard.locator("strong"),
    );
    await expectStyleParity(
      showcaseCard.locator(".type-family-mono.type-caption"),
      productCard.locator(".type-family-mono.type-caption"),
    );

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-media-${theme}`, testInfo);
    await context.close();
  });

  test(`Site Settings tab surface matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-site-settings",
      "/admin/settings",
      theme,
      { activeSudo: true },
    );

    await expect(product.getByText("高权限操作已解锁")).toBeVisible();
    const showcaseLead = showcase.locator('[data-pattern="tab-panel-lead"]');
    const productLead = product.locator('[data-pattern="tab-panel-lead"]');
    await expectStyleParity(showcaseLead, productLead);

    const showcaseCard = showcaseLead.locator(
      'xpath=following-sibling::*[@data-slot="card"][1]',
    );
    const productCard = productLead.locator(
      'xpath=following-sibling::*[@data-slot="card"][1]',
    );
    await expectStyleParity(showcaseCard, productCard);

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-site-settings-${theme}`, testInfo);
    await context.close();
  });

  test(`Users directory typography matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-users",
      "/admin/users",
      theme,
      { activeSudo: true },
    );

    await expect(product.getByText("高权限操作已解锁")).toBeVisible();
    const showcaseRow = showcase.getByRole("row").nth(1);
    const productRow = product.getByRole("row").nth(1);
    await expectStyleParity(showcaseRow, productRow);

    const showcaseWeights = showcaseRow.locator(".type-weight-semibold");
    const productWeights = productRow.locator(".type-weight-semibold");
    expect(await productWeights.count()).toBe(await showcaseWeights.count());
    for (let index = 0; index < (await productWeights.count()); index += 1) {
      await expectStyleParity(
        showcaseWeights.nth(index),
        productWeights.nth(index),
      );
    }

    await expectStyleParity(
      showcaseRow.locator(".type-family-mono.type-caption"),
      productRow.locator(".type-family-mono.type-caption"),
    );

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `support-users-${theme}`, testInfo);
    await context.close();
  });
}
