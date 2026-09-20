import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";
import { installAiFixtures } from "./ai-mock-api.mjs";

const showcaseOrigin = "http://127.0.0.1:4174";

async function styleFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      position: style.position,
      gap: style.gap,
      gridTemplateColumns: style.gridTemplateColumns,
      alignItems: style.alignItems,
      whiteSpace: style.whiteSpace,
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

async function typographyFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    };
  });
}

async function tabPanelLeadFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      minHeight: style.minHeight,
      gap: style.gap,
      alignItems: style.alignItems,
      height: Math.round(rect.height * 100) / 100,
    };
  });
}

async function layoutFingerprint(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const root = element;
    const content = root.firstElementChild;
    const nodes = content
      ? [content, ...Array.from(content.children), ...Array.from(content.children).flatMap((child) => Array.from(child.children))]
      : [];
    return nodes.map((node, index) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        index,
        tag: node.tagName.toLowerCase(),
        display: style.display,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        minHeight: style.minHeight,
        alignSelf: style.alignSelf,
      };
    });
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

async function openAiPair(
  browser,
  fixtureId,
  productPath,
  theme = "light",
  viewport = { width: 1440, height: 900 },
  { activeSudo = false } = {},
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
  const { unknown, unexpectedWrites } = await installAiFixtures(product);
  await showcase.goto(
    `${showcaseOrigin}/?embedded=1&workspace=blog-admin&brand=blog-admin#${fixtureId}`,
    { waitUntil: "networkidle" },
  );
  await product.goto(`http://127.0.0.1:4173${productPath}`, {
    waitUntil: "networkidle",
  });
  return { context, showcase, product, unknown, unexpectedWrites };
}

async function expectPatternCollectionParity({
  showcase,
  product,
  pattern,
}) {
  const showcaseItems = showcase.locator(`[data-pattern="${pattern}"]`);
  const productItems = product.locator(`[data-pattern="${pattern}"]`);
  const showcaseCount = await showcaseItems.count();
  const productCount = await productItems.count();
  expect(productCount).toBe(showcaseCount);
  expect(productCount).toBeGreaterThan(0);
  for (let index = 0; index < productCount; index += 1) {
    expect(await styleFingerprint(productItems.nth(index))).toEqual(
      await styleFingerprint(showcaseItems.nth(index)),
    );
  }
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
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
    expect(
      await styleFingerprint(productCard.locator(`[data-slot="${slot}"]`)),
    ).toEqual(
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

  for (const label of ["编辑", "分屏", "预览"]) {
    const showcaseMode = showcase.getByRole("button", {
      name: label,
      exact: true,
    });
    const productMode = product.getByRole("button", {
      name: label,
      exact: true,
    });
    const showcaseCount = await showcaseMode.count();
    const productCount = await productMode.count();
    expect(productCount).toBe(showcaseCount);
    if (showcaseCount > 0) {
      await expect(showcaseMode).toBeVisible();
      await expect(productMode).toBeVisible();
    }
  }

  await expectNoHorizontalOverflow(showcase);
  await expectNoHorizontalOverflow(product);
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

    const showcaseTopRow = showcaseCard.getByRole("row").nth(1);
    const productTopRow = productCard.getByRole("row").nth(1);
    for (const cellIndex of [1, 2, 3]) {
      expect(
        await typographyFingerprint(productTopRow.locator("td").nth(cellIndex)),
      ).toEqual(
        await typographyFingerprint(showcaseTopRow.locator("td").nth(cellIndex)),
      );
    }

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

    const showcasePostRow = showcase.getByRole("row").nth(1);
    const productPostRow = product.getByRole("row").nth(1);
    for (const selector of [
      "td:nth-child(2) span:first-child",
      "td:nth-child(2) code",
      "td:nth-child(4) time",
      "td:nth-child(5)",
    ]) {
      expect(
        await typographyFingerprint(productPostRow.locator(selector)),
      ).toEqual(
        await typographyFingerprint(showcasePostRow.locator(selector)),
      );
    }

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
    await product
      .getByRole("button", { name: /删除文章/ })
      .first()
      .click();

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

    const showcasePageRow = showcase.getByRole("row").nth(1);
    const productPageRow = product.getByRole("row").nth(1);
    for (const selector of [
      "td:nth-child(2) strong",
      "td:nth-child(3) code",
      "td:nth-child(7) time",
    ]) {
      expect(
        await typographyFingerprint(productPageRow.locator(selector)),
      ).toEqual(
        await typographyFingerprint(showcasePageRow.locator(selector)),
      );
    }

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

test("AI Settings tab leads and section rhythm match Showcase", async ({
  browser,
}, testInfo) => {
  const { context, showcase, product, unknown, unexpectedWrites } =
    await openAiPair(
      browser,
      "blog-admin-ai-settings",
      "/admin/ai-settings",
      "light",
      { width: 1440, height: 1000 },
      { activeSudo: true },
    );

  for (const tab of [
    "Agents",
    "Skills",
    "Tools",
    "知识库",
    "模型连接",
    "Sandbox 连接器",
  ]) {
    await showcase.getByRole("tab", { name: tab, exact: true }).click();
    await product.getByRole("tab", { name: tab, exact: true }).click();

    const showcaseLead = showcase.locator('[data-pattern="tab-panel-lead"]');
    const productLead = product.locator('[data-pattern="tab-panel-lead"]');
    await expect(showcaseLead).toHaveCount(1);
    await expect(productLead).toHaveCount(1);

    const [showcaseFingerprint, productFingerprint] = await Promise.all([
      tabPanelLeadFingerprint(showcaseLead),
      tabPanelLeadFingerprint(productLead),
    ]);
    expect(productFingerprint).toEqual(showcaseFingerprint);
    expect(productFingerprint.minHeight).toBe("36px");

    await pairScreenshot(
      showcase,
      product,
      `ai-settings-${tab.replaceAll(" ", "-")}`,
      testInfo,
    );
  }

  for (const { tab, createLabel, backLabel } of [
    {
      tab: "Agents",
      createLabel: "创建 Agent",
      backLabel: "返回 Agent 列表",
    },
    {
      tab: "Skills",
      createLabel: "创建 Skill",
      backLabel: "返回 Skill 列表",
    },
  ]) {
    await showcase.getByRole("tab", { name: tab, exact: true }).click();
    await product.getByRole("tab", { name: tab, exact: true }).click();
    await showcase
      .getByRole("button", { name: createLabel, exact: true })
      .click();
    await product
      .getByRole("button", { name: createLabel, exact: true })
      .click();

    const showcaseLayout = showcase.locator(
      '[data-pattern="dedicated-editor-layout"]',
    );
    const productLayout = product.locator(
      '[data-pattern="dedicated-editor-layout"]',
    );
    expect(await styleFingerprint(productLayout)).toEqual(
      await styleFingerprint(showcaseLayout),
    );
    await expectPatternCollectionParity({
      showcase,
      product,
      pattern: "dedicated-editor-section",
    });

    await pairScreenshot(
      showcase,
      product,
      `ai-settings-${tab.toLowerCase()}-dedicated-editor`,
      testInfo,
    );

    await showcase
      .getByRole("button", { name: backLabel, exact: true })
      .click();
    await product
      .getByRole("button", { name: backLabel, exact: true })
      .click();
  }

  for (const { tab, createLabel } of [
    { tab: "模型连接", createLabel: "添加模型连接" },
    { tab: "知识库", createLabel: "添加 Embedding 模型" },
    { tab: "Sandbox 连接器", createLabel: "添加 Connector Profile" },
  ]) {
    await showcase.getByRole("tab", { name: tab, exact: true }).click();
    await product.getByRole("tab", { name: tab, exact: true }).click();
    await showcase
      .getByRole("button", { name: createLabel, exact: true })
      .click();
    await product
      .getByRole("button", { name: createLabel, exact: true })
      .click();

    const showcaseDialog = showcase.getByRole("dialog", {
      name: createLabel,
    });
    const productDialog = product.getByRole("dialog", {
      name: createLabel,
    });
    expect(await styleFingerprint(productDialog)).toEqual(
      await styleFingerprint(showcaseDialog),
    );
    await expectPatternCollectionParity({
      showcase: showcaseDialog,
      product: productDialog,
      pattern: "editor-form-section",
    });

    await pairScreenshot(
      showcase,
      product,
      `ai-settings-${tab.replaceAll(" ", "-")}-drawer`,
      testInfo,
    );

    await showcase.keyboard.press("Escape");
    await product.keyboard.press("Escape");
    await expect(showcaseDialog).toBeHidden();
    await expect(productDialog).toBeHidden();
  }

  await expectNoHorizontalOverflow(showcase);
  await expectNoHorizontalOverflow(product);
  expect(unknown).toEqual([]);
  expect(unexpectedWrites).toEqual([]);
  await context.close();
});

test("AI Operations top-level panels, Recent Runs and Run Center match Showcase", async ({
  browser,
}, testInfo) => {
  const { context, showcase, product, unknown, unexpectedWrites } =
    await openAiPair(
      browser,
      "blog-admin-ai-operations",
      "/admin/ai-ops",
      "light",
      { width: 1440, height: 1000 },
    );

  for (const tab of ["概览", "待我处理", "自动化", "运行中心"]) {
    await showcase.getByRole("tab", { name: new RegExp(tab) }).click();
    await product.getByRole("tab", { name: new RegExp(tab) }).click();

    const showcaseLead = showcase.locator('[data-pattern="tab-panel-lead"]');
    const productLead = product.locator('[data-pattern="tab-panel-lead"]');
    await expect(showcaseLead).toHaveCount(1);
    await expect(productLead).toHaveCount(1);
    expect(await styleFingerprint(productLead)).toEqual(
      await styleFingerprint(showcaseLead),
    );
    expect(await tabPanelLeadFingerprint(productLead)).toEqual(
      await tabPanelLeadFingerprint(showcaseLead),
    );

    await expect(showcaseLead).not.toHaveText("");
    await expect(productLead).not.toHaveText("");
  }

  await showcase.getByRole("tab", { name: /自动化/ }).click();
  await product.getByRole("tab", { name: /自动化/ }).click();

  const showcaseWorkflowToolbar = showcase.locator(
    '[data-slot="workflow-list-toolbar"]',
  );
  const productWorkflowToolbar = product.locator(
    '[data-slot="workflow-list-toolbar"]',
  );
  expect(await styleFingerprint(productWorkflowToolbar)).toEqual(
    await styleFingerprint(showcaseWorkflowToolbar),
  );

  const showcaseWorkflowRow = showcase
    .getByRole("button", { name: /打开 Workflow：/ })
    .first();
  const productWorkflowRow = product
    .getByRole("button", { name: /打开 Workflow：/ })
    .first();
  expect(await styleFingerprint(productWorkflowRow)).toEqual(
    await styleFingerprint(showcaseWorkflowRow),
  );

  // Automation now uses list -> dedicated detail. Enter one Workflow on both
  // surfaces before comparing detail-only regions such as Recent Runs.
  await showcase.getByRole("button", { name: /打开 Workflow：/ }).first().click();
  await product.getByRole("button", { name: /打开 Workflow：/ }).first().click();

  const showcaseRecent = showcase.getByRole("region", { name: "最近运行" });
  const productRecent = product.getByRole("region", { name: "最近运行" });
  expect(await styleFingerprint(productRecent)).toEqual(
    await styleFingerprint(showcaseRecent),
  );

  const showcaseRecentRow = showcase
    .getByRole("button", {
      name: /打开最近 Run #/,
    })
    .first();
  const productRecentRow = product
    .getByRole("button", {
      name: /打开最近 Run #/,
    })
    .first();
  const [showcaseRecentStyle, productRecentStyle] = await Promise.all([
    styleFingerprint(showcaseRecentRow),
    styleFingerprint(productRecentRow),
  ]);
  delete showcaseRecentStyle.borderBottomWidth;
  delete productRecentStyle.borderBottomWidth;
  expect(productRecentStyle).toEqual(showcaseRecentStyle);
  expect(
    await showcaseRecentRow.evaluate((element) =>
      element.parentElement?.classList.contains("divide-y"),
    ),
  ).toBe(true);
  expect(
    await productRecentRow.evaluate((element) =>
      element.parentElement?.classList.contains("divide-y"),
    ),
  ).toBe(true);

  const [showcaseRecentLayout, productRecentLayout] = await Promise.all([
    layoutFingerprint(showcaseRecentRow),
    layoutFingerprint(productRecentRow),
  ]);
  expect(productRecentLayout).toEqual(showcaseRecentLayout);

  const [showcaseRecentBox, productRecentBox] = await Promise.all([
    showcaseRecentRow.boundingBox(),
    productRecentRow.boundingBox(),
  ]);
  expect(productRecentBox?.width).toBe(showcaseRecentBox?.width);

  const showcaseWorkflowDetail = showcase.locator(
    '[data-slot="workflow-detail"]',
  );
  const productWorkflowDetail = product.locator(
    '[data-slot="workflow-detail"]',
  );
  expect(await styleFingerprint(productWorkflowDetail)).toEqual(
    await styleFingerprint(showcaseWorkflowDetail),
  );

  const showcaseWorkflowOverview = showcaseWorkflowDetail
    .locator('[data-slot="card"]')
    .first();
  const productWorkflowOverview = productWorkflowDetail
    .locator('[data-slot="card"]')
    .first();
  expect(await styleFingerprint(productWorkflowOverview)).toEqual(
    await styleFingerprint(showcaseWorkflowOverview),
  );

  await showcase.getByRole("tab", { name: /待我处理/ }).click();
  await product.getByRole("tab", { name: /待我处理/ }).click();

  const showcaseInboxMasterDetail = showcase
    .locator('[data-slot="ops-master-detail"]')
    .first();
  const productInboxMasterDetail = product
    .locator('[data-slot="ops-master-detail"]')
    .first();
  expect(await styleFingerprint(productInboxMasterDetail)).toEqual(
    await styleFingerprint(showcaseInboxMasterDetail),
  );
  const [showcaseInboxMinHeight, productInboxMinHeight] = await Promise.all([
    showcaseInboxMasterDetail.evaluate(
      (element) => getComputedStyle(element).minHeight,
    ),
    productInboxMasterDetail.evaluate(
      (element) => getComputedStyle(element).minHeight,
    ),
  ]);
  expect(productInboxMinHeight).toBe(showcaseInboxMinHeight);

  await showcase.getByRole("tab", { name: /运行中心/ }).click();
  await product.getByRole("tab", { name: /运行中心/ }).click();

  const showcaseMasterDetail = showcase
    .locator('[data-slot="ops-master-detail"]')
    .first();
  const productMasterDetail = product
    .locator('[data-slot="ops-master-detail"]')
    .first();
  expect(await styleFingerprint(productMasterDetail)).toEqual(
    await styleFingerprint(showcaseMasterDetail),
  );

  const showcaseRail = showcase.locator('[data-slot="ops-rail"]').first();
  const productRail = product.locator('[data-slot="ops-rail"]').first();
  const [showcaseRailBox, productRailBox] = await Promise.all([
    showcaseRail.boundingBox(),
    productRail.boundingBox(),
  ]);
  expect(productRailBox?.width).toBe(showcaseRailBox?.width);

  const showcaseWorkflowRunDetail = showcase
    .locator('[data-pattern="record-detail-composition"]')
    .first();
  const productWorkflowRunDetail = product
    .locator('[data-pattern="record-detail-composition"]')
    .first();
  expect(await styleFingerprint(productWorkflowRunDetail)).toEqual(
    await styleFingerprint(showcaseWorkflowRunDetail),
  );

  for (const regionName of ["执行过程", "运行资源", "人工交互"]) {
    const showcaseRegion = showcase.getByRole("region", {
      name: regionName,
      exact: true,
    });
    const productRegion = product.getByRole("region", {
      name: regionName,
      exact: true,
    });
    await expect(showcaseRegion).toBeVisible();
    await expect(productRegion).toBeVisible();
    expect(await styleFingerprint(productRegion)).toEqual(
      await styleFingerprint(showcaseRegion),
    );
  }

  await showcase.getByRole("button", { name: /Agent 运行/ }).click();
  await product.getByRole("button", { name: /Agent 运行/ }).click();

  const showcaseAgentRail = showcase.locator('[data-slot="ops-rail"]').first();
  const productAgentRail = product.locator('[data-slot="ops-rail"]').first();
  const [showcaseAgentRailBox, productAgentRailBox] = await Promise.all([
    showcaseAgentRail.boundingBox(),
    productAgentRail.boundingBox(),
  ]);
  expect(productAgentRailBox?.width).toBe(showcaseAgentRailBox?.width);

  await expectNoHorizontalOverflow(showcase);
  await expectNoHorizontalOverflow(product);
  expect(unknown).toEqual([]);
  expect(unexpectedWrites).toEqual([]);
  await pairScreenshot(showcase, product, "ai-operations-parity", testInfo);
  await context.close();
});
