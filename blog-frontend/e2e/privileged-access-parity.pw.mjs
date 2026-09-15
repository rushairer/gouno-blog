import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";
import { installAiFixtures } from "./ai-mock-api.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";
const productOrigin = "http://127.0.0.1:4173";

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
  theme,
  { activeSudo = false, ai = false } = {},
) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  const fixtureState = ai
    ? await installAiFixtures(product)
    : { unknown: await installApiFixtures(product), unexpectedWrites: [] };

  await showcase.goto(
    `${showcaseOrigin}/?embedded=1&workspace=blog-admin&brand=blog-admin#${fixtureId}`,
    { waitUntil: "networkidle" },
  );
  await product.goto(`${productOrigin}${productPath}`, { waitUntil: "networkidle" });

  return { context, showcase, product, ...fixtureState };
}

async function chooseShowcaseSecurity(showcase, accessibleName) {
  const openFixture = showcase.getByRole("button", { name: "打开 Fixture 控制" });
  if (await openFixture.isVisible()) await openFixture.click();
  await showcase.getByRole("radio", { name: accessibleName }).check();
}

async function expectGateParity(showcase, product) {
  const showcaseGate = showcase.locator('[data-slot="blog-privileged-access-gate"]');
  const productGate = product.locator('[data-slot="blog-privileged-access-gate"]');
  await expect(showcaseGate).toBeVisible();
  await expect(productGate).toBeVisible();

  expect(await styleFingerprint(productGate)).toEqual(
    await styleFingerprint(showcaseGate),
  );

  const showcaseAlert = showcaseGate.locator('[data-slot="alert"]');
  const productAlert = productGate.locator('[data-slot="alert"]');
  expect(await styleFingerprint(productAlert)).toEqual(
    await styleFingerprint(showcaseAlert),
  );
  expect(await productAlert.getAttribute("data-type")).toBe(
    await showcaseAlert.getAttribute("data-type"),
  );
}

for (const theme of ["light", "dark"]) {
  test(`Members privileged gate locked state matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-users",
      "/admin/users",
      theme,
    );

    await chooseShowcaseSecurity(showcase, "已锁定");
    await expect(showcase.getByText("高权限操作需要身份验证")).toBeVisible();
    await expect(product.getByText("高权限操作需要身份验证")).toBeVisible();
    await expectGateParity(showcase, product);
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `privileged-members-locked-${theme}`, testInfo);
    await context.close();
  });

  test(`Site Settings privileged gate unlocked state matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-site-settings",
      "/admin/settings",
      theme,
      { activeSudo: true },
    );

    await expect(showcase.getByText("高权限操作已解锁")).toBeVisible();
    await expect(product.getByText("高权限操作已解锁")).toBeVisible();
    await expectGateParity(showcase, product);
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `privileged-site-unlocked-${theme}`, testInfo);
    await context.close();
  });

  test(`Members expired-on-action state matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown } = await openPair(
      browser,
      "blog-admin-users",
      "/admin/users",
      theme,
      { activeSudo: true },
    );

    await chooseShowcaseSecurity(showcase, "操作时过期");
    await product.evaluate(() => {
      window.dispatchEvent(new Event("gouno:sudo-session-stale"));
    });

    await expect(showcase.getByText("近期 MFA 即将过期")).toBeVisible();
    await expect(product.getByText("近期 MFA 即将过期")).toBeVisible();
    await expect(product.getByText(/下一次高权限写操作将触发 Step-Up/)).toBeVisible();
    await expectGateParity(showcase, product);
    expect(unknown).toEqual([]);
    await pairScreenshot(showcase, product, `privileged-members-expiring-${theme}`, testInfo);
    await context.close();
  });

  test(`AI model connection privileged gate matches Showcase (${theme})`, async ({
    browser,
  }, testInfo) => {
    const { context, showcase, product, unknown, unexpectedWrites } = await openPair(
      browser,
      "blog-admin-ai-settings",
      "/admin/ai-settings?section=providers",
      theme,
      { activeSudo: true, ai: true },
    );

    await expect(showcase.getByText("高权限操作已解锁")).toBeVisible();
    await expect(product.getByText("高权限操作已解锁")).toBeVisible();
    await expectGateParity(showcase, product);
    expect(unknown).toEqual([]);
    expect(unexpectedWrites).toEqual([]);
    await pairScreenshot(showcase, product, `privileged-ai-provider-${theme}`, testInfo);
    await context.close();
  });
}
