import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";

async function styleFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
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
    await testInfo.attach(`${label}-${kind}`, { path, contentType: "image/png" });
  }
}

async function openPair(browser, fixtureId, productPath, theme = "light") {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
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

for (const theme of ["light", "dark"]) {
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

  test(`Post editor Card and command bar match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-post-editor",
      "/admin/posts/101/edit",
      theme,
    );
    const showcaseCard = showcase.locator(
      '[data-slot="card"][aria-label="文章编辑器"]',
    );
    const productCard = product.locator(".editor-page > [data-slot=card]");
    expect(await styleFingerprint(productCard)).toEqual(
      await styleFingerprint(showcaseCard),
    );

    const showcaseCommandBar = showcaseCard.locator("header").first();
    const productCommandBar = product.locator(".editor-commandbar");
    expect(await styleFingerprint(productCommandBar)).toEqual(
      await styleFingerprint(showcaseCommandBar),
    );
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `post-editor-${theme}`, testInfo);
    await context.close();
  });

  test(`Page editor Card and command bar match Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-page-editor",
      "/admin/pages/201/edit",
      theme,
    );
    const showcaseCard = showcase.locator(
      '[data-slot="card"][aria-label="单页编辑器"]',
    );
    const productCard = product.locator(".editor-page > [data-slot=card]");
    expect(await styleFingerprint(productCard)).toEqual(
      await styleFingerprint(showcaseCard),
    );

    const showcaseCommandBar = showcaseCard.locator("header").first();
    const productCommandBar = product.locator(".editor-commandbar");
    expect(await styleFingerprint(productCommandBar)).toEqual(
      await styleFingerprint(showcaseCommandBar),
    );
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `page-editor-${theme}`, testInfo);
    await context.close();
  });
}
