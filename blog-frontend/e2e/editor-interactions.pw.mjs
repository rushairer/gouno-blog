import { expect, test } from "@playwright/test";
import { installApiFixtures, setTheme } from "./mock-api.mjs";
import { limitedProfile } from "./session-fixtures.mjs";

async function openAdmin(page, path, options = {}) {
  await setTheme(page, options.theme || "light");
  const unknown = await installApiFixtures(page, options);
  await page.goto(path, { waitUntil: "networkidle" });
  return unknown;
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
}

test("Post editor binds canonical AI review, media, outline, history and save workflows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const unknown = await openAdmin(page, "/admin/posts/101/edit");

  await expect(page.locator('[data-slot="document-editor-shell"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="document-editor-navigator"]')).toBeVisible();
  await expect(page.getByLabel("文章正文 Markdown")).toContainText("Browser Acceptance");

  await page.getByRole("button", { name: "AI 生成标题候选" }).click();
  await expect(page.getByRole("radio", { name: "Browser AI Title A" })).toBeChecked();
  await page.getByRole("button", { name: "重新生成 AI 建议" }).click();
  await expect(page.getByRole("radio", { name: "Browser AI Title Regenerated 2" })).toBeChecked();
  await page.getByRole("button", { name: "使用所选" }).click();
  await expect(
    page.getByRole("textbox", { name: "标题", exact: true }),
  ).toHaveValue("Browser AI Title Regenerated 2");

  await page.getByRole("button", { name: "AI 根据正文生成摘要" }).click();
  await expect(page.getByRole("radio", { name: "Browser AI Summary 1" })).toBeChecked();
  await page.getByRole("button", { name: "使用所选" }).click();
  await expect(page.getByLabel("摘要")).toHaveValue("Browser AI Summary 1");

  await page.getByRole("button", { name: "AI 优化路径与 SEO" }).click();
  await expect(page.getByRole("checkbox", { name: "应用 SEO 描述 建议" })).toBeChecked();
  await page.getByRole("checkbox", { name: "应用 SEO 描述 建议" }).uncheck();
  await page.getByRole("button", { name: "应用 2 项建议" }).click();
  await expect(page.getByLabel("访问路径 (Slug)")).toHaveValue("browser-ai-reviewed");
  await expect(page.getByLabel("SEO 标题")).toHaveValue("Browser AI Reviewed SEO");
  await expect(page.getByLabel("SEO 描述")).toHaveValue("");

  await page.getByRole("button", { name: "AI 推荐分类与标签" }).click();
  await expect(page.getByRole("checkbox", { name: "应用 分类 建议" })).toBeChecked();
  await page.getByRole("button", { name: "应用 2 项建议" }).click();
  await expect(page.getByRole("combobox", { name: "分类" })).toContainText(
    "Browser Acceptance Category",
  );
  await expect(page.getByLabel("标签")).toHaveValue("Parity, Browser, AI Reviewed");

  await page.getByRole("button", { name: "AI 写作" }).click();
  await page.getByRole("menuitem", { name: "继续写作" }).click();
  await page.getByRole("button", { name: "生成 / 执行" }).click();
  await expect(page.getByText("AI Generated Section", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "追加到末尾" }).click();
  await expect(page.getByLabel("文章正文 Markdown")).toContainText("AI Generated Section");

  await page.getByRole("button", { name: "选择文章封面" }).click();
  await page.getByRole("menuitem", { name: "从媒体库选择" }).click();
  await page.getByRole("button", { name: /browser-acceptance.svg/i }).click();
  await page.getByRole("button", { name: "使用所选" }).click();
  await expect(page.getByLabel("封面 URL")).toHaveValue("/browser-acceptance.svg");
  await expect(page.getByLabel("替代文本")).toHaveValue("Browser Acceptance Media");

  await page.getByRole("button", { name: "选择文章封面" }).click();
  await page.getByRole("menuitem", { name: "上传图片" }).click();
  await page.getByLabel("上传图片文件").setInputFiles({
    name: "acceptance-cover.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'),
  });
  await expect(page.getByText("上传完成")).toBeVisible();
  await page.getByRole("button", { name: "使用已上传图片" }).click();
  await expect(page.getByLabel("封面 URL")).toHaveValue("/browser-acceptance.svg");

  await page.getByRole("button", { name: "选择文章封面" }).click();
  await page.getByRole("menuitem", { name: "AI 生成封面" }).click();
  await page.getByLabel("生图提示词").fill("Browser acceptance AI cover");
  await page.getByRole("button", { name: "生成单张图片" }).click();
  await expect(page.getByText("生成结果")).toBeVisible();
  await expect(page.getByLabel("封面 URL")).toHaveValue("/browser-acceptance.svg");
  await page.getByRole("button", { name: "使用此封面" }).click();
  await expect(page.getByLabel("封面 URL")).toHaveValue("/browser-acceptance.svg");

  const outlineItem = page.getByRole("button", { name: "跳转到 Browser Acceptance" });
  await expect(outlineItem).toBeVisible();
  const outlineTextStyle = await outlineItem.locator("span").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
    };
  });
  expect(outlineTextStyle.whiteSpace).toBe("nowrap");
  expect(outlineTextStyle.overflow).toBe("hidden");
  expect(outlineTextStyle.textOverflow).toBe("ellipsis");

  await page.getByRole("tab", { name: /历史 1/ }).click();
  await page.getByRole("button", { name: /Browser Acceptance Post.*历史版本/ }).click();
  await expect(page.getByRole("dialog", { name: "恢复历史版本" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();

  await page.getByRole("button", { name: "更新文章" }).click();
  await expect(page.locator('[data-slot="notification"]')).toContainText("文章已成功发布");
  await expectNoHorizontalOverflow(page);
  expect(unknown).toEqual([]);
});

test("Post editor exposes revision conflict without dropping the working draft", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const unknown = await openAdmin(page, "/admin/posts/101/edit", {
    conflictPostSaveRequests: 1,
  });

  const title = page.getByRole("textbox", { name: "标题", exact: true });
  await title.fill("Unsaved conflict draft");
  await page.getByRole("button", { name: "更新文章" }).click();
  await expect(page.getByText("文章已有新版本")).toBeVisible();
  await expect(title).toHaveValue("Unsaved conflict draft");
  await expectNoHorizontalOverflow(page);
  expect(unknown).toEqual([]);
});

test("Page editor keeps Post-only navigator out and reviews title summary metadata before save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unknown = await openAdmin(page, "/admin/pages/201/edit", { theme: "dark" });

  await expect(page.locator('[data-slot="document-editor-navigator"]')).toHaveCount(0);
  await page.getByRole("button", { name: "AI 生成标题候选" }).click();
  await page.getByRole("button", { name: "重新生成 AI 建议" }).click();
  await page.getByRole("button", { name: "使用所选" }).click();
  await expect(
    page.getByRole("textbox", { name: "标题", exact: true }),
  ).toHaveValue("Browser AI Title Regenerated 2");

  await page.getByRole("button", { name: "AI 根据正文生成摘要" }).click();
  await page.getByRole("button", { name: "使用所选" }).click();
  await expect(page.getByLabel("摘要 / 描述")).toHaveValue("Browser AI Summary 1");

  await page.getByRole("button", { name: "AI 优化路径与 SEO" }).click();
  await page.getByRole("button", { name: "应用 3 项建议" }).click();
  await expect(page.getByLabel("访问路径 (Slug)")).toHaveValue("browser-ai-reviewed");
  await expect(page.getByLabel("SEO 标题")).toHaveValue("Browser AI Reviewed SEO");
  await expect(page.getByLabel("SEO 描述")).toHaveValue("Browser AI reviewed description");

  await page.getByRole("button", { name: "更新单页" }).click();
  await expect(page.locator('[data-slot="notification"]')).toContainText("单页已成功发布");
  await expectNoHorizontalOverflow(page);
  expect(unknown).toEqual([]);
});

test("Read-only post editor removes write and AI actions for another author's post", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const unknown = await openAdmin(page, "/admin/posts/101/edit", {
    profile: {
      ...limitedProfile,
      sub: "browser-acceptance-author",
      principal: {
        ...limitedProfile.principal,
        id: 7,
        subject: "browser-acceptance-author",
      },
    },
  });

  await expect(page.getByText(/只读模式/)).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "标题", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "AI 写作" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更新文章" })).toHaveCount(0);
  expect(unknown).toEqual([]);
});

test("Category Slug suggestions regenerate, invalidate on edits and require explicit apply", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unknown = await openAdmin(page, "/admin/categories");

  await page.getByRole("button", { name: /编辑分类 Browser Acceptance Category/ }).click();
  await page.getByRole("button", { name: "AI 生成 Slug 建议" }).click();
  await expect(page.getByRole("radio", { name: "browser-category-1" })).toBeChecked();
  await page.getByRole("button", { name: "重新生成 AI 建议" }).click();
  await expect(page.getByRole("radio", { name: "browser-category-2" })).toBeChecked();
  await expect(page.getByLabel("Slug 标识")).toHaveValue("browser-acceptance");
  await page.getByRole("button", { name: "使用所选 Slug" }).click();
  await expect(page.getByLabel("Slug 标识")).toHaveValue("browser-category-2");

  await page.getByRole("button", { name: "AI 生成 Slug 建议" }).click();
  await expect(page.getByRole("radio", { name: "browser-category-3" })).toBeVisible();
  await page.getByLabel("分类名称").fill("Changed Category Name");
  await expect(page.getByRole("radio", { name: "browser-category-3" })).toHaveCount(0);

  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: /编辑分类 Browser Acceptance Category/ }).click();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByLabel("Slug 标识").fill("browser-category-saved");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.locator('[data-slot="notification"]')).toContainText("分类已更新");
  await expectNoHorizontalOverflow(page);
  expect(unknown).toEqual([]);
});
