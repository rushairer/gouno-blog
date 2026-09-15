import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

function opaqueBackground(value) {
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) return value !== "transparent";
  const parts = rgba[1].split(",").map((item) => item.trim());
  return parts.length < 4 || Number(parts[3]) === 1;
}

test("Dashboard fatal load error remains page-level and retryable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, "light");
  const unknown = await installApiFixtures(page, {
    failCoreKey: "dashboard",
    failCoreRequests: 2,
  });
  await page.goto("/admin/dashboard", { waitUntil: "networkidle" });

  await expect(page.getByText("数据概览加载失败")).toBeVisible();
  await page.getByRole("button", { name: "重新载入" }).click();
  await expect(page.getByText("文章总数")).toBeVisible();
  expect(unknown).toEqual([]);
});

test("Posts selection reveals the canonical contextual bulk action bar", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setTheme(page, "dark");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/posts", { waitUntil: "networkidle" });

  const checkbox = page.getByRole("checkbox", { name: /选择文章 Browser Acceptance Post/ }).first();
  await checkbox.check();
  await expect(page.getByText("已选择 1 篇")).toBeVisible();
  await expect(page.getByRole("button", { name: "交给 AI" })).toBeVisible();
  expect(unknown).toEqual([]);
});

test("Pages transient copy feedback is canonical opaque Notification", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  await setTheme(page, "light");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/pages", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /复制单页链接 Browser Acceptance Page/ }).click();
  const notification = page.locator('[data-slot="notification"]');
  await expect(notification).toContainText("单页链接已复制");
  const presentation = await notification.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      position: style.position,
      borderRadius: style.borderRadius,
      right: innerWidth - rect.right,
      top: rect.top,
    };
  });
  expect(opaqueBackground(presentation.backgroundColor)).toBe(true);
  expect(presentation.borderRadius).not.toBe("0px");
  expect(presentation.right).toBeGreaterThanOrEqual(8);
  expect(presentation.top).toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-slot="notification-region"]')).toHaveCSS("position", "fixed");
  expect(unknown).toEqual([]);
});

test("Post editor validation uses Notification while feedback stays outside editor Card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "dark");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/posts/new", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.locator('[data-slot="notification"]')).toContainText("请先填写文章标题");
  const editor = page.locator(".editor-page");
  await expect(editor.locator(":scope > [data-slot=card]")).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  expect(unknown).toEqual([]);
});

test("Existing Page editor loads deterministic content at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await setTheme(page, "light");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/pages/201/edit", { waitUntil: "networkidle" });

  await expect(page.getByPlaceholder("写一个清晰、具体的单页标题")).toHaveValue(
    "Browser Acceptance Page",
  );
  await expect(page.locator(".editor-commandbar")).toBeVisible();
  expect(unknown).toEqual([]);
});
