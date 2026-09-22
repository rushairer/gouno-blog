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
  {
    activeSudo = false,
    viewport = { width: 1440, height: 900 },
  } = {},
) {
  const context = await browser.newContext({ viewport });
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

    const showcaseTable = showcase.getByRole("table");
    const productTable = product.getByRole("table");
    await expectStyleParity(showcaseTable, productTable);

    const showcaseRow = showcase.getByRole("row").nth(1);
    const productRow = product.getByRole("row").nth(1);
    // Row bottom borders are data-count dependent: Product fixture has one
    // category (therefore :last-child), while Showcase intentionally has
    // several. Compare the table owner plus the reviewed cell typography.
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
    await pairScreenshot(
      showcase,
      product,
      `support-categories-${theme}`,
      testInfo,
    );

    await showcase
      .getByRole("button", { name: "新建分类", exact: true })
      .click();
    await product
      .getByRole("button", { name: "新建分类", exact: true })
      .click();

    const showcaseDialog = showcase.getByRole("dialog", { name: "新建分类" });
    const productDialog = product.getByRole("dialog", { name: "新建分类" });
    const showcaseForm = showcaseDialog.locator(
      '[data-pattern="editor-form-composition"]',
    );
    const productForm = productDialog.locator(
      '[data-pattern="editor-form-composition"]',
    );
    await expectStyleParity(showcaseForm, productForm);

    const showcaseSlug = showcaseDialog.getByRole("textbox", {
      name: "Slug 标识",
      exact: true,
    });
    const productSlug = productDialog.getByRole("textbox", {
      name: "Slug 标识",
      exact: true,
    });
    await expectStyleParity(showcaseSlug, productSlug);

    await pairScreenshot(
      showcase,
      product,
      `support-categories-drawer-${theme}`,
      testInfo,
    );
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
    const showcaseTable = showcase.getByRole("table");
    const productTable = product.getByRole("table");
    await expectStyleParity(showcaseTable, productTable);

    const showcaseRow = showcase.getByRole("row").nth(1);
    const productRow = product.getByRole("row").nth(1);
    // Product fixture has a single member, so the first data row is also the
    // last row and correctly drops its bottom border. The table owner and
    // semantic typography remain the parity contract.
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

test("Notifications selected batch action matches Showcase (mobile dark)", async ({
  browser,
}, testInfo) => {
  const { context, showcase, product, unknown } = await openPair(
    browser,
    "blog-admin-notifications",
    "/admin/notifications",
    "dark",
    { viewport: { width: 390, height: 844 } },
  );

  await showcase.getByRole("checkbox", { name: /^选择通知 / }).first().check();
  await product.getByRole("checkbox", { name: /^选择通知 / }).first().check();

  const showcaseToolbar = showcase.getByRole("toolbar", { name: "批量操作" });
  const productToolbar = product.getByRole("toolbar", { name: "批量操作" });
  await expect(showcaseToolbar).toBeVisible();
  await expect(productToolbar).toBeVisible();
  await expectStyleParity(showcaseToolbar, productToolbar);

  for (const label of ["标为已读", "批量删除", "取消"]) {
    await expectStyleParity(
      showcaseToolbar.getByRole("button", { name: label, exact: true }),
      productToolbar.getByRole("button", { name: label, exact: true }),
    );
  }

  await expectNoHorizontalOverflow(showcase);
  await expectNoHorizontalOverflow(product);
  expect(unknown).toEqual([]);
  await pairScreenshot(
    showcase,
    product,
    "support-notifications-selection-mobile-dark",
    testInfo,
  );
  await context.close();
});

test("Media selected-resource AI handoff matches Showcase (mobile dark)", async ({
  browser,
}, testInfo) => {
  const { context, showcase, product, unknown } = await openPair(
    browser,
    "blog-admin-media-library",
    "/admin/media",
    "dark",
    { viewport: { width: 390, height: 844 } },
  );

  await showcase.getByRole("checkbox", { name: /^选择媒体 / }).first().check();
  await product.getByRole("checkbox", { name: /^选择媒体 / }).first().check();

  const showcaseToolbar = showcase.getByRole("toolbar", { name: "批量操作" });
  const productToolbar = product.getByRole("toolbar", { name: "批量操作" });
  await expectStyleParity(showcaseToolbar, productToolbar);

  const showcaseAi = showcaseToolbar.getByRole("button", {
    name: "交给 AI",
    exact: true,
  });
  const productAi = productToolbar.getByRole("button", {
    name: "交给 AI",
    exact: true,
  });
  await expect(showcaseAi.locator("svg.lucide-sparkles")).toHaveCount(1);
  await expect(productAi.locator("svg.lucide-sparkles")).toHaveCount(1);
  await expectStyleParity(showcaseAi, productAi);
  await expect(
    showcaseToolbar.getByRole("button", { name: "取消", exact: true }),
  ).toBeVisible();
  await expect(
    productToolbar.getByRole("button", { name: "取消", exact: true }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(showcase);
  await expectNoHorizontalOverflow(product);
  expect(unknown).toEqual([]);
  await pairScreenshot(
    showcase,
    product,
    "support-media-ai-handoff-selection-mobile-dark",
    testInfo,
  );
  await context.close();
});

test("Users edit-permissions modal matches Showcase", async ({
  browser,
}, testInfo) => {
  const { context, showcase, product, unknown } = await openPair(
    browser,
    "blog-admin-users",
    "/admin/users",
    "light",
    { activeSudo: true },
  );

  await showcase
    .getByRole("button", { name: /^编辑 .* 成员与权限$/ })
    .first()
    .click();
  await product
    .getByRole("button", { name: /^编辑 .* 成员与权限$/ })
    .first()
    .click();

  const showcaseDialog = showcase
    .getByRole("dialog")
    .filter({ hasText: "成员显示昵称 / 备注名" });
  const productDialog = product
    .getByRole("dialog")
    .filter({ hasText: "成员显示昵称 / 备注名" });
  await expect(showcaseDialog).toBeVisible();
  await expect(productDialog).toBeVisible();
  await expectStyleParity(showcaseDialog, productDialog);

  expect(unknown).toEqual([]);
  await pairScreenshot(
    showcase,
    product,
    "support-users-edit-permissions-modal-light",
    testInfo,
  );
  await context.close();
});

for (const surface of [
  {
    name: "categories",
    fixture: "blog-admin-categories",
    path: "/admin/categories",
    selectFirst: async (page) => {
      await page.getByRole("row").nth(1).getByRole("checkbox").check();
    },
  },
  {
    name: "tags",
    fixture: "blog-admin-tags",
    path: "/admin/tags",
    selectFirst: async (page) => {
      await page.getByRole("checkbox", { name: /选择标签/ }).first().check();
    },
  },
  {
    name: "comments",
    fixture: "blog-admin-comments",
    path: "/admin/comments",
    selectFirst: async (page) => {
      await page.getByRole("listitem").first().getByRole("checkbox").check();
    },
  },
]) {
  test(`Support ${surface.name} selected-resource AI handoff matches Showcase`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      surface.fixture,
      surface.path,
      "light",
    );

    await surface.selectFirst(showcase);
    await surface.selectFirst(product);

    const showcaseToolbar = showcase.getByRole("toolbar", { name: "批量操作" });
    const productToolbar = product.getByRole("toolbar", { name: "批量操作" });
    await expect(showcaseToolbar).toBeVisible();
    await expect(productToolbar).toBeVisible();

    const showcaseAi = showcaseToolbar.getByRole("button", {
      name: "交给 AI",
      exact: true,
    });
    const productAi = productToolbar.getByRole("button", {
      name: "交给 AI",
      exact: true,
    });
    await expect(showcaseAi.locator("svg.lucide-sparkles")).toHaveCount(1);
    await expect(productAi.locator("svg.lucide-sparkles")).toHaveCount(1);
    await expectStyleParity(showcaseAi, productAi);
    await expect(
      showcaseToolbar.getByRole("button", { name: "取消", exact: true }),
    ).toBeVisible();
    await expect(
      productToolbar.getByRole("button", { name: "取消", exact: true }),
    ).toBeVisible();

    expect(unknown).toEqual([]);
    await pairScreenshot(
      showcase,
      product,
      `support-${surface.name}-ai-handoff-selected-light`,
      testInfo,
    );
    await context.close();
  });
}

for (const surface of [
  {
    name: "categories",
    fixture: "blog-admin-categories",
    path: "/admin/categories",
    firstItem: (page) => page.getByRole("listitem").first(),
  },
  {
    name: "tags",
    fixture: "blog-admin-tags",
    path: "/admin/tags",
    firstItem: (page) =>
      page
        .getByRole("checkbox", { name: /选择标签/ })
        .first()
        .locator('xpath=ancestor::*[@data-slot="card"][1]'),
  },
  {
    name: "comments",
    fixture: "blog-admin-comments",
    path: "/admin/comments",
    firstItem: (page) => page.getByRole("listitem").first(),
  },
]) {
  test(`Support ${surface.name} mobile composition matches Showcase`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      surface.fixture,
      surface.path,
      "light",
      { viewport: { width: 390, height: 844 } },
    );

    const showcaseItem = surface.firstItem(showcase);
    const productItem = surface.firstItem(product);
    await expectStyleParity(showcaseItem, productItem);
    await expectStyleParity(
      showcaseItem.locator("strong").first(),
      productItem.locator("strong").first(),
    );

    await expectNoHorizontalOverflow(showcase);
    await expectNoHorizontalOverflow(product);
    expect(unknown).toEqual([]);
    await pairScreenshot(
      showcase,
      product,
      `support-${surface.name}-mobile-light`,
      testInfo,
    );
    await context.close();
  });
}

