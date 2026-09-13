import {
  category,
  comment,
  mediaItem,
  member,
  notification,
  siteSettings,
  tag,
} from "./fixtures.mjs";
import { adminProfile } from "./session-fixtures.mjs";

const envelope = (data) => JSON.stringify({ data });

export async function installApiFixtures(page, options = {}) {
  const unknown = [];
  const profile = options.profile || adminProfile;
  let failSettingsOnce = Boolean(options.failSettingsOnce);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method !== "GET" && method !== "HEAD") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const respond = async (data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope(data),
      });

    if (path === "/api/me/blog-session") return respond(profile);
    if (path === "/api/site") return respond(siteSettings);
    if (path === "/api/admin/categories") return respond([category]);
    if (path === "/api/admin/tags") return respond([tag]);
    if (path === "/api/admin/comments") return respond([comment]);
    if (path === "/api/me/notifications") {
      return respond({ list: [notification], total: 1 });
    }
    if (path === "/api/admin/media") return respond([mediaItem]);
    if (path === "/api/admin/members") return respond({ members: [member] });
    if (path.startsWith("/api/admin/media/") && path.endsWith("/references")) {
      return respond([]);
    }
    if (path === "/api/admin/settings") {
      if (failSettingsOnce) {
        failSettingsOnce = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "browser injected settings failure" }),
        });
        return;
      }
      return respond(siteSettings);
    }

    unknown.push(`${method} ${path}`);
    return respond(null);
  });

  return unknown;
}

export async function setTheme(page, theme) {
  await page.addInitScript((mode) => {
    localStorage.setItem("gouno-blog:theme", mode);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}
