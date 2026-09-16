import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";
import {
  expectGeometryParity,
  expectStyleParity,
  pairScreenshot,
} from "./showcase-parity-helpers.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";
const productOrigin = "http://127.0.0.1:4173";

for (const theme of ["light", "dark"]) {
  test(`Users PageHeader actions match Showcase (${theme})`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const showcase = await context.newPage();
    const product = await context.newPage();

    await setTheme(showcase, theme);
    await setTheme(product, theme);
    const unknown = await installApiFixtures(product);

    await showcase.goto(
      `${showcaseOrigin}/?embedded=1&workspace=blog-admin&brand=blog-admin#blog-admin-users`,
      { waitUntil: "networkidle" },
    );
    await product.goto(`${productOrigin}/admin/users`, {
      waitUntil: "networkidle",
    });

    const showcaseRefresh = showcase.getByRole("button", {
      name: "刷新",
      exact: true,
    });
    const productRefresh = product.getByRole("button", {
      name: "刷新",
      exact: true,
    });
    const showcaseGosso = showcase.getByRole("button", {
      name: "打开 GOSSO Admin",
      exact: true,
    });
    const productGosso = product.getByRole("link", {
      name: "打开 GOSSO Admin",
      exact: true,
    });

    await expectStyleParity(showcaseRefresh, productRefresh);
    await expectGeometryParity(showcaseRefresh, productRefresh);
    await expectStyleParity(showcaseGosso, productGosso);
    await expectGeometryParity(showcaseGosso, productGosso);

    await expect(productRefresh).toHaveAttribute("data-variant", "outline");
    await expect(productRefresh).toHaveAttribute("data-size", "default");
    await expect(productGosso).toHaveAttribute("data-variant", "outline");
    await expect(productGosso).toHaveAttribute("data-size", "default");

    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `users-actions-${theme}`, testInfo);
    await context.close();
  });
}
