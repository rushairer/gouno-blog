import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";

async function enableSudoUiState(page) {
  await page.addInitScript(() => {
    localStorage.setItem("gouno:sudo_activated_at", Date.now().toString());
  });
}

test("Media Library selection uses compact canonical checkbox geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "dark");
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/media", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("browser-acceptance.svg")).toBeVisible();
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).toBeVisible();
  const box = await checkbox.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeLessThanOrEqual(28);
  expect(box.width).toBeLessThanOrEqual(28);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  expect(unknown).toEqual([]);
});

test("Site Settings fails closed and recovers through retry", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setTheme(page, "light");
  await enableSudoUiState(page);
  const unknown = await installApiFixtures(page, { failSettingsOnce: true });
  await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("站点设置加载失败")).toBeVisible();
  await expect(page.getByText("browser injected settings failure")).toBeVisible();
  await page.getByRole("button", { name: "重新载入" }).click();
  await expect(page.getByDisplayValue("Browser Acceptance Blog")).toBeVisible();
  expect(unknown).toEqual([]);
});

test("Users edit action opens the canonical modal without writing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, "light");
  await enableSudoUiState(page);
  const unknown = await installApiFixtures(page);
  await page.goto("/admin/users", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Fixture Member")).toBeVisible();
  await page
    .getByRole("button", { name: "编辑 Fixture Member 成员与权限" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(unknown).toEqual([]);
});
