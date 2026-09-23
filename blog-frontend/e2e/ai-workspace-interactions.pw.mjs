import { expect, test } from "@playwright/test";
import { installAiFixtures, prepareAiBrowserState } from "./ai-mock-api.mjs";

function captureConsoleProblems(page) {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function expectNoDocumentOverflow(page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function openAiPage(page, path, { theme = "light", width = 1440, height = 900 } = {}) {
  await page.setViewportSize({ width, height });
  await prepareAiBrowserState(page, theme);
  const consoleProblems = captureConsoleProblems(page);
  const fixtureState = await installAiFixtures(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { consoleProblems, fixtureState };
}

function expectFixtureHealth(state, consoleProblems) {
  expect(state.unknown).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
  expect(consoleProblems).toEqual([]);
}

test("mobile operational tabs preserve tab query semantics without document overflow", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=overview",
    { theme: "dark", width: 390, height: 844 },
  );

  await page.getByRole("tab", { name: "Automation" }).click();
  await expect(page.getByRole("tab", { name: "Automation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(new URL(page.url()).searchParams.get("tab")).toBe("automation");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-mobile-automation");
});

test("legacy advanced deep link redirects to the dedicated Provider settings section", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=advanced&section=providers",
    { width: 1024, height: 768 },
  );

  await expect(page.getByRole("heading", { level: 1, name: "AI Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Model connections" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const current = new URL(page.url());
  expect(current.pathname).toBe("/admin/ai-settings");
  expect(current.searchParams.get("section")).toBe("providers");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-legacy-advanced-redirect");
});

test("failed approval drills from the mobile decision queue into one readable workbench", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=inbox",
    { width: 390, height: 844 },
  );

  const frame = page.locator('[data-slot="ops-master-detail"]').first();
  const rail = frame.locator('[data-slot="ops-rail"]');
  const detail = frame.locator('[data-slot="ops-detail-pane"]');
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();

  await rail
    .getByRole("button", {
      name: /Review: Apply a content proposal to related content/,
    })
    .click();

  await expect(frame).toHaveAttribute("data-mobile-pane", "detail");
  await expect(rail).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Back to decision queue" }),
  ).toBeVisible();
  await expect(
    detail
      .getByRole("alert")
      .getByText("Injected approval failure remains actionable and visibly explained."),
  ).toBeVisible();
  await expect(
    detail.getByRole("region", { name: "Content proposal preview" }),
  ).toBeVisible();
  await expect(detail.getByText("Long-form execution result").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-mobile-inbox-drill-in");

  await detail.getByRole("button", { name: "Back to decision queue" }).click();
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();
});

test("Agent run detail drills from the mobile list and keeps long Markdown readable", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=records&record=agent",
    { width: 390, height: 844 },
  );

  const frame = page.locator('[data-slot="ops-master-detail"]').first();
  const rail = frame.locator('[data-slot="ops-rail"]');
  const detail = frame.locator('[data-slot="ops-detail-pane"]');
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();

  await rail.getByRole("button", { name: "Inspect Run #101" }).click();
  await expect(frame).toHaveAttribute("data-mobile-pane", "detail");
  await expect(rail).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "Back to run list" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "AI output" })).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "Long-form execution result" }),
  ).toBeVisible();
  await expect(detail.locator(".agent-output pre").first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get("run")).toBe("101");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-mobile-agent-run-drill-in");

  await detail.getByRole("button", { name: "Back to run list" }).click();
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();
  expect(new URL(page.url()).searchParams.get("run")).toBeNull();
});

test("Workflow run detail drills from the mobile list and preserves run query state", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=records&record=workflow",
    { width: 390, height: 844 },
  );

  const frame = page.locator('[data-slot="ops-master-detail"]').first();
  const rail = frame.locator('[data-slot="ops-rail"]');
  const detail = frame.locator('[data-slot="ops-detail-pane"]');
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();
  expect(new URL(page.url()).searchParams.get("run")).toBeNull();

  const workflowRunRow = rail
    .getByRole("listitem")
    .filter({ hasText: "Run #201" });
  await workflowRunRow.getByRole("button").click();

  await expect(frame).toHaveAttribute("data-mobile-pane", "detail");
  await expect(rail).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "Back to run list" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Run summary" })).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "Long-form execution result" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("run")).toBe("201");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-mobile-workflow-run-drill-in");

  await detail.getByRole("button", { name: "Back to run list" }).click();
  await expect(frame).toHaveAttribute("data-mobile-pane", "master");
  await expect(rail).toBeVisible();
  await expect(detail).toBeHidden();
  expect(new URL(page.url()).searchParams.get("run")).toBeNull();
});

test("Workflow run detail contains long output and preserves run query state", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-ops?tab=records&record=workflow",
    { width: 768, height: 1024, theme: "dark" },
  );

  const workflowRunList = page.getByRole("list", { name: "Workflow run list" });
  await expect(workflowRunList).toBeVisible();
  const workflowRunRow = workflowRunList
    .getByRole("listitem")
    .filter({ hasText: "Run #201" });
  await workflowRunRow.getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Run summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Long-form execution result" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("run")).toBe("201");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-workflow-long-output");
});

test("Skill Tool authorization contains long identifiers without overflow", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-settings?section=skills",
    { width: 1440, height: 900 },
  );

  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: /Edit Skill/ })).toBeVisible();

  const longToolName = page.getByText("analytics.list_low_engagement_posts", {
    exact: true,
  });
  await expect(longToolName).toBeVisible();
  const toolCard = longToolName.locator("xpath=ancestor::label[1]");
  const toolNameGeometry = await longToolName.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowWrap: getComputedStyle(element).overflowWrap,
  }));
  const toolCardGeometry = await toolCard.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(toolNameGeometry.overflowWrap).toBe("anywhere");
  expect(toolNameGeometry.scrollWidth).toBeLessThanOrEqual(
    toolNameGeometry.clientWidth + 1,
  );
  expect(toolCardGeometry.scrollWidth).toBeLessThanOrEqual(
    toolCardGeometry.clientWidth + 1,
  );
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-skill-long-tool-identifier");
});

test("Skill copy uses a controlled modal without submitting a mutation", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-settings?section=skills",
    { width: 1024, height: 768 },
  );

  await page.getByRole("button", { name: "Copy Skill" }).click();
  const copiedSkillName = page.getByRole("textbox", { name: "Copied Skill name" });
  await expect(copiedSkillName).toBeVisible();
  await expect(copiedSkillName).toHaveValue("Editorial Operations Copy");
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-skill-copy-modal");
});

test("Provider settings expose provider and embedding configuration without writes", async ({ page }, testInfo) => {
  const { consoleProblems, fixtureState } = await openAiPage(
    page,
    "/admin/ai-settings?section=providers",
    { width: 1440, height: 900, theme: "dark" },
  );

  await expect(page.getByText("OpenAI Primary", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add model connection" }).click();
  const providerDrawer = page.getByRole("dialog", { name: "Add model connection" });
  await expect(providerDrawer).toBeVisible();
  await expect(providerDrawer.getByLabel("API Key")).toHaveAttribute("required", "");
  await page.keyboard.press("Escape");
  await expect(providerDrawer).toBeHidden();

  await page.getByRole("tab", { name: "Knowledge index" }).click();
  await expect(page.getByText("Primary Embeddings", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Index overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Indexed content" })).toBeVisible();
  await expect(page.getByText("OAuth 2.1 and PKCE", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("section")).toBe("knowledge");

  await page
    .getByRole("textbox", { name: "Knowledge retrieval test" })
    .fill("Why is PKCE important?");
  await page.getByRole("button", { name: "Test retrieval" }).click();
  await expect(page.getByText("kb_fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Semantic 0.94", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add embedding profile" }).click();
  const embeddingDrawer = page.getByRole("dialog", {
    name: "Add embedding profile",
  });
  await expect(embeddingDrawer).toBeVisible();
  await expect(embeddingDrawer.getByLabel("API Key")).toHaveAttribute(
    "required",
    "",
  );
  await expectNoDocumentOverflow(page);
  expectFixtureHealth(fixtureState, consoleProblems);
  await attachScreenshot(page, testInfo, "u04a-provider-editor");
});
