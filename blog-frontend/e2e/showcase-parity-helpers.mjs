import { expect } from "@playwright/test";

export async function styleFingerprint(locator) {
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

export async function expectStyleParity(showcaseLocator, productLocator) {
  expect(await styleFingerprint(productLocator)).toEqual(
    await styleFingerprint(showcaseLocator),
  );
}

export async function expectGeometryParity(
  showcaseLocator,
  productLocator,
  { width = true, height = true } = {},
) {
  await expect(showcaseLocator).toBeVisible();
  await expect(productLocator).toBeVisible();
  const [showcaseBox, productBox] = await Promise.all([
    showcaseLocator.boundingBox(),
    productLocator.boundingBox(),
  ]);
  expect(showcaseBox).not.toBeNull();
  expect(productBox).not.toBeNull();
  if (width) expect(productBox?.width).toBe(showcaseBox?.width);
  if (height) expect(productBox?.height).toBe(showcaseBox?.height);
}

export async function pairScreenshot(showcase, product, label, testInfo) {
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
