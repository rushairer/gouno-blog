import { test } from "@playwright/test";
import { installAiFixtures, prepareAiBrowserState } from "./ai-mock-api.mjs";

async function open(page, path, width = 1024, height = 768, theme = "light") {
  await page.setViewportSize({ width, height });
  await prepareAiBrowserState(page, theme);
  const fixture = await installAiFixtures(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  return fixture;
}

test("diagnose workflow overflow", async ({ page }) => {
  await open(page, "/admin/ai-ops?tab=records&record=workflow", 768, 1024, "dark");
  const list = page.getByRole("list", { name: "Workflow run list" });
  const row = list.getByRole("listitem").filter({ hasText: "Run #201" });
  await row.getByLabel("Inspect", { exact: true }).click();
  await page.getByRole("heading", { name: "Run summary" }).waitFor();
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewport = root.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const node = element;
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          className: typeof node.className === "string" ? node.className : "",
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
        };
      })
      .filter((item) => item.right > viewport + 1 || item.scrollWidth > item.clientWidth + 1)
      .sort((a, b) => Math.max(b.right - viewport, b.scrollWidth - b.clientWidth) - Math.max(a.right - viewport, a.scrollWidth - a.clientWidth))
      .slice(0, 30);
    return { viewport, rootClientWidth: root.clientWidth, rootScrollWidth: root.scrollWidth, offenders };
  });
  console.log("U04A_WORKFLOW_OVERFLOW", JSON.stringify(result));
});

test("diagnose skill copy modal", async ({ page }) => {
  const fixture = await open(page, "/admin/ai-settings?section=skills");
  const button = page.getByRole("button", { name: "Copy Skill" });
  console.log("U04A_SKILL_BEFORE", JSON.stringify({ url: page.url(), count: await button.count(), unknown: fixture.unknown, writes: fixture.unexpectedWrites }));
  await button.click();
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    url: location.href,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    modalBodies: document.querySelectorAll('[data-slot="modal-body"]').length,
    copiedInputs: [...document.querySelectorAll('input')].map((input) => ({ aria: input.getAttribute('aria-label'), value: input.value, hidden: input.hidden, type: input.type })),
    copyTextCount: [...document.querySelectorAll('body *')].filter((node) => (node.textContent || '').trim() === 'Copy Skill').length,
    createCopyCount: [...document.querySelectorAll('button')].filter((node) => (node.textContent || '').includes('Create copy')).length,
    activeElement: document.activeElement?.outerHTML?.slice(0, 500) || null,
    bodyTextTail: document.body.innerText.slice(-1200),
  }));
  console.log("U04A_SKILL_AFTER", JSON.stringify(state));
});

test("diagnose provider to knowledge transition", async ({ page }) => {
  const fixture = await open(page, "/admin/ai-settings?section=providers", 1440, 900, "dark");
  await page.getByText("OpenAI Primary", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add Provider" }).click();
  await page.getByRole("heading", { name: "Add Provider" }).waitFor();
  await page.getByRole("tab", { name: "Knowledge index" }).click();
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    url: location.href,
    selectedTabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((node) => node.textContent?.trim()),
    strongTexts: [...document.querySelectorAll('strong')].map((node) => node.textContent?.trim()).filter(Boolean),
    chunksTextCount: [...document.querySelectorAll('body *')].filter((node) => (node.textContent || '').trim() === 'Chunks').length,
    primaryEmbeddingsTextCount: [...document.querySelectorAll('body *')].filter((node) => (node.textContent || '').trim() === 'Primary Embeddings').length,
    inputLabels: [...document.querySelectorAll('input')].map((input) => input.getAttribute('aria-label')).filter(Boolean),
  }));
  console.log("U04A_KNOWLEDGE_AFTER", JSON.stringify({ ...state, unknown: fixture.unknown, writes: fixture.unexpectedWrites }));
});
