import { expect, test } from "@playwright/test";

const sudoKey = "gouno:sudo_activated_at";

async function openHarness(page, context, seedPrevious = false) {
  // Isolated same-origin pages: no real BFF, credentials, or Provider calls.
  await context.route("**/mfa-popup-harness", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>MFA harness</title>" }),
  );
  await context.route("**/api/auth/mfa/step-up?**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>MFA callback fixture</title>" }),
  );
  await page.goto("/mfa-popup-harness");
  const popupReady = page.waitForEvent("popup");
  await page.evaluate(async (seed) => {
    const mfa = await import("/src/mfa.ts");
    localStorage.clear();
    if (seed) localStorage.setItem("gouno:sudo_activated_at", String(Date.now() - 1000));
    window.popupResult = { success: 0, cancelled: 0, completed: 0 };
    window.addEventListener(mfa.STEP_UP_COMPLETED_EVENT, () => window.popupResult.completed++);
    if (!mfa.openStepUpPopup("/admin?step_up_popup=1", () => window.popupResult.success++, () => window.popupResult.cancelled++)) {
      throw new Error("Test browser blocked the popup");
    }
  }, seedPrevious);
  const popup = await popupReady;
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

async function result(page) {
  return page.evaluate(() => window.popupResult);
}

test("closing a real popup cancels once despite a previous success marker", async ({ page, context }) => {
  const popup = await openHarness(page, context, true);
  const before = await page.evaluate((key) => localStorage.getItem(key), sudoKey);
  await popup.close();
  await expect.poll(() => result(page)).toEqual({ success: 0, cancelled: 1, completed: 0 });
  // Observe beyond the old second pending timeout (300ms poll, 400ms grace).
  await page.waitForTimeout(800);
  expect(await result(page)).toEqual({ success: 0, cancelled: 1, completed: 0 });
  expect(await page.evaluate((key) => localStorage.getItem(key), sudoKey)).toBe(before);
});

test("an unrelated same-origin window cannot complete the popup through postMessage", async ({ page, context }) => {
  const popup = await openHarness(page, context);
  await page.evaluate(async () => {
    const mfa = await import("/src/mfa.ts");
    window.postMessage({ type: mfa.STEP_UP_MESSAGE_TYPE, timestamp: Date.now() }, window.location.origin);
  });
  await page.waitForTimeout(100);
  expect(await result(page)).toEqual({ success: 0, cancelled: 0, completed: 0 });
  expect(popup.isClosed()).toBe(false);
  await popup.close();
  await expect.poll(() => result(page)).toEqual({ success: 0, cancelled: 1, completed: 0 });
});

test("the real callback completes once without an opener through same-origin transports", async ({ page, context }) => {
  const popup = await openHarness(page, context);
  // Exercise the existing callback sender rather than fabricating success in the receiver.
  await popup.evaluate(async () => {
    window.opener = null;
    window.history.replaceState({}, "", "/admin?step_up_popup=1");
    const mfa = await import("/src/mfa.ts");
    mfa.checkAndHandleStepUpPopupCallback();
  }).catch((error) => {
    // Successful callback closes its own browsing context.
    if (!/Target page, context or browser has been closed/.test(String(error))) throw error;
  });
  await expect.poll(() => result(page)).toEqual({ success: 1, cancelled: 0, completed: 1 });
  await page.waitForTimeout(1100);
  expect(await result(page)).toEqual({ success: 1, cancelled: 0, completed: 1 });
});
