import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";

async function styleFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      position: style.position,
      gap: style.gap,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
    };
  });
}

async function pairScreenshot(showcase, product, label, testInfo) {
  for (const [kind, page] of [
    ["showcase", showcase],
    ["product", product],
  ]) {
    const path = testInfo.outputPath(`${label}-${kind}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(`${label}-${kind}`, {
      path,
      contentType: "image/png",
    });
  }
}

async function openPair(
  browser,
  fixtureId,
  productPath,
  theme = "light",
  viewport = { width: 1440, height: 900 },
) {
  const context = await browser.newContext({ viewport });
  const showcase = await context.newPage();
  const product = await context.newPage();
  await setTheme(showcase, theme);
  await setTheme(product, theme);
  const unknown = await installApiFixtures(product);
  await showcase.goto(
    `${showcaseOrigin}/?embedded=1&workspace=blog-admin&brand=blog-admin#${fixtureId}`,
    { waitUntil: "networkidle" },
  );
  await product.goto(`http://127.0.0.1:4173${productPath}`, {
    waitUntil: "networkidle",
  });
  return { context, showcase, product, unknown };
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
}

async function expectEditorParity({
  showcase,
  product,
  ariaLabel,
  hasNavigator,
}) {
  const showcaseCard = showcase.locator(
    `[data-slot="card"][aria-label="${ariaLabel}"]`,
  );
  const productCard = product.locator(
    `[data-slot="card"][aria-label="${ariaLabel}"]`,
  );
  expect(await styleFingerprint(productCard)).toEqual(
    await styleFingerprint(showcaseCard),
  );

  const showcaseCommandBar = showcaseCard.locator(
    '[data-slot="document-editor-command-bar"]',
  );
  const productCommandBar = productCard.locator(
    '[data-slot="document-editor-command-bar"]',
  );
  expect(await styleFingerprint(productCommandBar)).toEqual(
    await styleFingerprint(showcaseCommandBar),
  );

  const showcaseWorkspace = showcaseCard.locator(
    '[data-slot="document-editor-workspace"]',
  );
  const productWorkspace = productCard.locator(
    '[data-slot="document-editor-workspace"]',
  );
  expect(await styleFingerprint(productWorkspace)).toEqual(
    await styleFingerprint(showcaseWorkspace),
  );

  for (const slot of ["document-editor-canvas", "document-editor-inspector"]) {
    expect(await styleFingerprint(productCard.locator(`[data-slot="${slot}"]`))).toEqual(
      await styleFingerprint(showcaseCard.locator(`[data-slot="${slot}"]`)),
    );
  }

  const showcaseNavigator = showcaseCard.locator(
    '[data-slot="document-editor-navigator"]',
  );
  const productNavigator = productCard.locator(
    '[data-slot="document-editor-navigator"]',
  );
  if (hasNavigator) {
    expect(await styleFingerprint(productNavigator)).toEqual(
      await styleFingerprint(showcaseNavigator),
    );
  } else {
    await expect(productNavigator).toHaveCount(0);
    await expect(showcaseNavigator).toHaveCount(0);
  }

  for (const page of [showcase, product]) {
    await expect(page.getByRole("button", { name: "编辑" })).toBeVisible();
    await expect(page.getByRole("button", { name: "分屏" })).toBeVisible();
    await expect(page.getByRole("button", { name: "预览" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
}

for (const theme of ["light", "dark"]) {
  test(`Dashboard Top Posts surface and action geometry match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-dashboard",
      "/admin/dashboard",
      theme,
    );
    const showcaseCard = showcase
      .getByText("表现最佳文章", { exact: true })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const productCard = product
      .getByText("表现最佳文章", { exact: true })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    expect(await styleFingerprint(productCard)).toEqual(
      await styleFingerprint(showcaseCard),
    );

    const showcaseActions = showcaseCard
      .getByRole("row")
      .nth(1)
      .getByRole("button");
    const productActions = productCard
      .getByRole("row")
      .nth(1)
      .getByRole("link");
    await expect(showcaseActions).toHaveCount(2);
    await expect(productActions).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const [showcaseBox, productBox] = await Promise.all([
        showcaseActions.nth(index).boundingBox(),
        productActions.nth(index).boundingBox(),
      ]);
      expect(productBox?.width).toBe(showcaseBox?.width);
      expect(productBox?.height).toBe(showcaseBox?.height);
    }
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `dashboard-${theme}`, testInfo);
    await context.close();
  });

  test(`Posts filter surface and checkbox geometry match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-posts",
      "/admin/posts",
      theme,
    );
    const showcaseFilter = showcase
      .getByLabel("搜索文章")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const productFilter = product
      .getByLabel("搜索文章")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    expect(await styleFingerprint(productFilter)).toEqual(
      await styleFingerprint(showcaseFilter),
    );

    const showcaseCheckbox = showcase.getByRole("checkbox", {
      name: "选择当前页全部文章",
    });
    const productCheckbox = product.getByRole("checkbox", {
      name: "选择当前页全部文章",
    });
    const [showcaseBox, productBox] = await Promise.all([
      showcaseCheckbox.boundingBox(),
      productCheckbox.boundingBox(),
    ]);
    expect(productBox?.width).toBe(showcaseBox?.width);
    expect(productBox?.height).toBe(showcaseBox?.height);
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `posts-${theme}`, testInfo);
    await context.close();
  });

  test(`Posts destructive modal and overlay match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-posts",
      "/admin/posts",
      theme,
    );

    await showcase.getByRole("button", { name: "删除文章" }).first().click();
    await product.getByRole("button", { name: /删除文章/ }).first().click();

    const showcaseDialog = showcase.getByRole("dialog");
    const productDialog = product.getByRole("dialog");
    expect(await styleFingerprint(productDialog)).toEqual(
      await styleFingerprint(showcaseDialog),
    );
    const [showcaseDialogBox, productDialogBox] = await Promise.all([
      showcaseDialog.boundingBox(),
      productDialog.boundingBox(),
    ]);
    expect(productDialogBox?.width).toBe(showcaseDialogBox?.width);

    const showcaseBody = showcaseDialog.locator('[data-slot="modal-body"]');
    const productBody = productDialog.locator('[data-slot="modal-body"]');
    expect(await styleFingerprint(productBody)).toEqual(
      await styleFingerprint(showcaseBody),
    );

    const showcaseOverlay = showcase.locator('[data-slot="dialog-overlay"]');
    const productOverlay = product.locator('[data-slot="dialog-overlay"]');
    expect(await styleFingerprint(productOverlay)).toEqual(
      await styleFingerprint(showcaseOverlay),
    );

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `posts-modal-${theme}`, testInfo);
    await context.close();
  });

  test(`Posts mobile surface hierarchy matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-posts",
      "/admin/posts",
      theme,
      { width: 390, height: 844 },
    );

    const showcaseFilter = showcase
      .getByLabel("搜索文章")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const productFilter = product
      .getByLabel("搜索文章")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    expect(await styleFingerprint(productFilter)).toEqual(
      await styleFingerprint(showcaseFilter),
    );

    const showcaseItem = showcase.getByRole("listitem").first();
    const productItem = product.getByRole("listitem").first();
    expect(await styleFingerprint(productItem)).toEqual(
      await styleFingerprint(showcaseItem),
    );

    await expectNoHorizontalOverflow(showcase);
    await expectNoHorizontalOverflow(product);

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `posts-mobile-${theme}`, testInfo);
    await context.close();
  });

  test(`Pages filter surface and collection Card match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-pages",
      "/admin/pages",
      theme,
    );
    const showcaseFilter = showcase
      .getByLabel("搜索单页")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const productFilter = product
      .getByLabel("搜索单页")
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    expect(await styleFingerprint(productFilter)).toEqual(
      await styleFingerprint(showcaseFilter),
    );
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `pages-${theme}`, testInfo);
    await context.close();
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`Post editor canonical shell matches Showcase (${theme}, ${viewport.name})`, async ({
      browser,
    }, testInfo) => {
      const { context, showcase, product, unknown } = await openPair(
        browser,
        "blog-admin-post-editor",
        "/admin/posts/101/edit",
        theme,
        { width: viewport.width, height: viewport.height },
      );

      await expectEditorParity({
        showcase,
        product,
        ariaLabel: "文章编辑器",
        hasNavigator: true,
      });
      expect(unknown).toEqual([]);
      await pairScreenshot(
        showcase,
        product,
        `post-editor-${viewport.name}-${theme}`,
        testInfo,
      );
      await context.close();
    });

    test(`Page editor canonical shell matches Showcase (${theme}, ${viewport.name})`, async ({
      browser,
    }, testInfo) => {
      const { context, showcase, product, unknown } = await openPair(
        browser,
        "blog-admin-page-editor",
        "/admin/pages/201/edit",
        theme,
        { width: viewport.width, height: viewport.height },
      );

      await expectEditorParity({
        showcase,
        product,
        ariaLabel: "单页编辑器",
        hasNavigator: false,
      });
      expect(unknown).toEqual([]);
      await pairScreenshot(
        showcase,
        product,
        `page-editor-${viewport.name}-${theme}`,
        testInfo,
      );
      await context.close();
    });
  }
}
