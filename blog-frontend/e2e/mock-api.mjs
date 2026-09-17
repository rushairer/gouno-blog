import {
  category,
  comment,
  mediaItem,
  member,
  notification,
  siteSettings,
  tag,
} from "./fixtures.mjs";
import {
  adminPage,
  adminPost,
  adminPostVersion,
  dashboardSummary,
} from "./core-admin-fixtures.mjs";
import { adminProfile } from "./session-fixtures.mjs";

const envelope = (data) => JSON.stringify({ data });
const productApiUrl = /^https?:\/\/[^/]+\/api\//;

async function jsonBody(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    return {};
  }
}

export async function installApiFixtures(page, options = {}) {
  const unknown = [];
  const profile = options.profile || adminProfile;
  let failSettingsOnce = Boolean(options.failSettingsOnce);
  const failCoreKey = options.failCoreKey || options.failCoreOnce || "";
  let failCoreRemaining = Number(
    options.failCoreRequests ?? (failCoreKey ? 1 : 0),
  );
  let conflictPostSaveRemaining = Number(options.conflictPostSaveRequests ?? 0);
  let titleSuggestionRound = 0;
  let summarySuggestionRound = 0;
  let slugSuggestionRound = 0;

  await page.route(productApiUrl, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    const respond = async (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: envelope(data),
      });

    const respondError = async (status, message) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ message }),
      });

    const failCore = async (key) => {
      if (failCoreKey !== key || failCoreRemaining <= 0) return false;
      failCoreRemaining -= 1;
      await respondError(500, `browser injected ${key} failure`);
      return true;
    };

    if (method === "POST" && path === "/api/admin/ai-draft-assist") {
      const body = await jsonBody(request);
      if (body.task === "title") {
        titleSuggestionRound += 1;
        return respond({
          suggestions:
            titleSuggestionRound === 1
              ? ["Browser AI Title A", "Browser AI Title B"]
              : [`Browser AI Title Regenerated ${titleSuggestionRound}`],
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "summary") {
        summarySuggestionRound += 1;
        return respond({
          suggestions: [`Browser AI Summary ${summarySuggestionRound}`],
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "slug") {
        slugSuggestionRound += 1;
        return respond({
          suggestions: [`browser-category-${slugSuggestionRound}`],
          metadata: { slug: `browser-category-${slugSuggestionRound}` },
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "seo") {
        return respond({
          suggestions: [],
          metadata: {
            slug: "browser-ai-reviewed",
            seo_title: "Browser AI Reviewed SEO",
            seo_description: "Browser AI reviewed description",
          },
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "metadata_all") {
        return respond({
          suggestions: [],
          metadata: {
            category: category.name,
            tags: ["Browser", "AI Reviewed"],
          },
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "cover_prompt") {
        return respond({
          suggestions: [
            "A clean editorial illustration about browser acceptance",
            "A minimal technical article cover with browser windows",
          ],
          provider: "fixture",
          model: "fixture",
        });
      }
      if (body.task === "content") {
        return respond({
          suggestions: ["## AI Generated Section\n\nBrowser acceptance generated content."],
          provider: "fixture",
          model: "fixture",
        });
      }
      return respond({ suggestions: [] });
    }

    if (method === "POST" && path === "/api/admin/ai-generate-image") {
      const body = await jsonBody(request);
      return respond({
        url: mediaItem.url,
        alt_text: body.alt_text || "AI generated browser acceptance image",
        provider: "fixture",
        model: "fixture",
      });
    }

    if (method === "POST" && path === "/api/admin/media") {
      return respond(mediaItem);
    }

    if (method === "PUT" && path === "/api/posts/101") {
      if (conflictPostSaveRemaining > 0) {
        conflictPostSaveRemaining -= 1;
        return respondError(409, "内容已被其他编辑者更新（409 冲突）");
      }
      const body = await jsonBody(request);
      return respond({ ...adminPost, ...body, id: 101, revision: 4 });
    }

    if (method === "POST" && path === "/api/posts") {
      const body = await jsonBody(request);
      return respond({
        ...adminPost,
        ...body,
        id: 102,
        revision: 1,
        created_at: "2026-09-17T03:00:00Z",
      });
    }

    if (
      method === "POST" &&
      path === "/api/admin/posts/101/versions/11/restore"
    ) {
      return respond({ ...adminPostVersion, id: 101, revision: 4 });
    }

    if (method === "PUT" && path === "/api/admin/pages/201") {
      const body = await jsonBody(request);
      return respond({ ...adminPage, ...body, id: 201 });
    }

    if (method === "POST" && path === "/api/admin/pages") {
      const body = await jsonBody(request);
      return respond({
        ...adminPage,
        ...body,
        id: 202,
        created_at: "2026-09-17T03:00:00Z",
      });
    }

    if (method === "POST" && path === "/api/admin/categories") {
      const body = await jsonBody(request);
      return respond({ ...category, ...body, id: 2 });
    }

    if (method === "PUT" && /^\/api\/admin\/categories\/\d+$/.test(path)) {
      const body = await jsonBody(request);
      return respond({ ...category, ...body });
    }

    if (method === "DELETE" && /^\/api\/admin\/categories\/\d+$/.test(path)) {
      return route.fulfill({ status: 204, body: "" });
    }

    if (method !== "GET" && method !== "HEAD") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path === "/api/me/blog-session") return respond(profile);
    if (path === "/api/site") return respond(siteSettings);
    if (path === "/api/admin/analytics") {
      if (await failCore("dashboard")) return;
      return respond(dashboardSummary);
    }
    if (path === "/api/admin/posts") {
      if (await failCore("posts")) return;
      return respond({ list: [adminPost], total: 1, page: 1, page_size: 20 });
    }
    if (path === "/api/admin/posts/101") {
      if (await failCore("post-editor")) return;
      return respond(adminPost);
    }
    if (path === "/api/admin/posts/101/versions") return respond([adminPostVersion]);
    if (path === "/api/admin/pages") {
      if (await failCore("pages")) return;
      return respond({ list: [adminPage], total: 1, page: 1, page_size: 20 });
    }
    if (path === "/api/admin/pages/201") {
      if (await failCore("page-editor")) return;
      return respond(adminPage);
    }
    if (path === "/api/admin/categories") return respond([category]);
    if (path === "/api/categories") return respond([category]);
    if (path === "/api/admin/tags") return respond([tag]);
    if (path === "/api/tags") return respond([tag]);
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
        await respondError(500, "browser injected settings failure");
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
