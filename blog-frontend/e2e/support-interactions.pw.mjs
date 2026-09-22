import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

async function enableSudoUiState(page) {
  await page.addInitScript(() => {
    localStorage.setItem("gouno:sudo_activated_at", Date.now().toString());
  });
}

async function captureWave3Evidence(page, testInfo, name) {
  const screenshotPath = testInfo.outputPath(name);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

test("Admin shell uses a title-free header and single-language navigation groups", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, "light");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/media", { waitUntil: "domcontentloaded" });

  const shell = page.locator('[data-slot="app-shell"]');
  const header = shell.locator(":scope > header");
  const navigation = shell
    .getByRole("navigation", { name: "后台导航" })
    .filter({ visible: true });

  await expect(
    page.getByRole("heading", { level: 1, name: "媒体库" }),
  ).toBeVisible();
  await expect(header).not.toContainText("媒体库");
  const storefrontLink = header.getByRole("link", { name: "在新窗口查看前台站点" });
  await expect(storefrontLink).toBeVisible();
  await expect(storefrontLink).toHaveAttribute("href", "/");
  await expect(storefrontLink).toHaveAttribute("target", "_blank");
  const themeButton = header.getByRole("button", { name: "切换后台主题" });
  const [storefrontGeometry, themeGeometry] = await Promise.all(
    [storefrontLink, themeButton].map((control) =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: Number.parseFloat(getComputedStyle(element).borderRadius),
        };
      }),
    ),
  );
  expect(storefrontGeometry).toEqual(themeGeometry);
  expect(storefrontGeometry.width).toBe(storefrontGeometry.height);
  await expect(navigation.getByRole("heading")).toHaveText([
    "内容管理",
    "AI 运营",
    "站点管理",
  ]);
  await expect(navigation).not.toContainText("Content");
  await expect(navigation).not.toContainText("AI Automation");
  await expect(navigation).not.toContainText("Site");

  await navigation.getByRole("link", { name: "分类", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "分类" }),
  ).toBeVisible();

  const screenshotPath = testInfo.outputPath("admin-shell-navigation.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach("admin-shell-navigation", {
    path: screenshotPath,
    contentType: "image/png",
  });

  expect(unknown).toEqual([]);
});

test("Media Library selection uses compact canonical checkbox geometry", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "dark");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/media", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("browser-acceptance.svg")).toBeVisible();
  await expect(page.getByRole("link", { name: "在新窗口查看前台站点" })).toBeVisible();
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).toBeVisible();
  const box = await checkbox.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeLessThanOrEqual(28);
  expect(box.width).toBeLessThanOrEqual(28);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await captureWave3Evidence(
    page,
    testInfo,
    "wave3-media-selection-mobile-dark.png",
  );
  expect(unknown).toEqual([]);
});

test("Notifications selected batch action keeps canonical BulkActionBar state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "dark");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/notifications", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Browser Acceptance Notification")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "选择通知 Browser Acceptance Notification" })
    .check();

  const bulkBar = page.getByRole("toolbar", { name: "批量操作" });
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar).toContainText("已选择 1 条通知");
  await expect(bulkBar.getByRole("button", { name: "标为已读" })).toBeVisible();
  await expect(bulkBar.getByRole("button", { name: "批量删除" })).toBeVisible();
  await expect(bulkBar.getByRole("button", { name: "取消" })).toBeVisible();

  await captureWave3Evidence(
    page,
    testInfo,
    "wave3-notifications-selection-mobile-dark.png",
  );

  await bulkBar.getByRole("button", { name: "标为已读" }).click();
  await expect(bulkBar).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "选择通知 Browser Acceptance Notification" }),
  ).not.toBeChecked();
  await expect(page.getByRole("button", { name: "全部标为已读" })).toHaveCount(0);
  expect(unknown).toEqual([]);
});

test("Site Settings fails closed and recovers through retry", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setTheme(page, "light");
  await enableSudoUiState(page);
  const unknown = await installApiFixtures(page, { failSettingsOnce: true });
  await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("站点设置加载失败")).toBeVisible();
  await expect(page.getByText("browser injected settings failure")).toBeVisible();
  await captureWave3Evidence(
    page,
    testInfo,
    "wave3-site-settings-load-error.png",
  );

  await page.getByRole("button", { name: "重新载入" }).click();
  await expect(page.locator("input").first()).toHaveValue(
    "Browser Acceptance Blog",
  );
  await captureWave3Evidence(
    page,
    testInfo,
    "wave3-site-settings-recovered.png",
  );
  expect(unknown).toEqual([]);
});

test("Users edit action opens the canonical modal without writing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, "light");
  await enableSudoUiState(page);
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/users", { waitUntil: "domcontentloaded" });

  await page
    .getByRole("button", { name: "编辑 Fixture Member 成员与权限" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await captureWave3Evidence(
    page,
    testInfo,
    "wave3-users-edit-modal.png",
  );
  expect(unknown).toEqual([]);
});
