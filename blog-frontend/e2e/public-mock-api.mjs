import { adminProfile } from "./session-fixtures.mjs";
import {
  aboutPage,
  designSystemPage,
  linksPage,
  publicCategories,
  publicComment,
  publicNavPages,
  publicNotifications,
  publicPosts,
  publicSiteSettings,
  publicTags,
  publicTagSummaries,
} from "./public-fixtures.mjs";

const envelope = (data) => JSON.stringify({ data });
const productApiUrl = /^https?:\/\/[^/]+\/api\//;

function matchesPost(post, params) {
  const search = (params.get("search") || params.get("q") || "").toLowerCase();
  const tag = params.get("tag") || "";
  const category = params.get("category") || "";
  if (
    search &&
    !`${post.title} ${post.summary} ${post.content} ${post.tags.join(" ")}`
      .toLowerCase()
      .includes(search)
  ) {
    return false;
  }
  if (tag && !post.tags.includes(tag)) return false;
  if (
    category &&
    post.category?.slug !== category &&
    post.category?.name !== category
  ) {
    return false;
  }
  return true;
}

function paginated(posts, params) {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.max(1, Number(params.get("pageSize")) || 10);
  const start = (page - 1) * pageSize;
  return {
    list: posts.slice(start, start + pageSize),
    total: posts.length,
    page,
    page_size: pageSize,
  };
}

export async function installPublicApiFixtures(page, options = {}) {
  const unknown = [];
  let notifications = publicNotifications.map((item) => ({ ...item }));
  let likes = publicPosts[0]?.likes_count || 0;
  let liked = false;

  await page.route(productApiUrl, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const respond = async (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: envelope(data),
      });

    if (options.fail?.has(`${method} ${path}`)) {
      return respond({ message: "Browser fixture failure" }, 503);
    }

    if (method !== "GET" && method !== "HEAD") {
      if (/^\/api\/posts\/\d+\/view$/.test(path)) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      const readMatch = path.match(/^\/api\/me\/notifications\/(\d+)\/read$/);
      if (method === "PUT" && readMatch) {
        const id = Number(readMatch[1]);
        notifications = notifications.map((item) =>
          item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
        );
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      if (method === "PUT" && path === "/api/me/notifications/read-all") {
        const now = new Date().toISOString();
        notifications = notifications.map((item) => ({
          ...item,
          read_at: item.read_at || now,
        }));
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      const likeMatch = path.match(/^\/api\/posts\/(\d+)\/like$/);
      if (likeMatch && (method === "PUT" || method === "DELETE")) {
        liked = method === "PUT";
        likes += liked ? 1 : -1;
        return respond({ liked, likes_count: likes });
      }

      const commentMatch = path.match(/^\/api\/posts\/(\d+)\/comments$/);
      if (method === "POST" && commentMatch) {
        const body = request.postDataJSON();
        return respond({
          id: 901,
          post_id: Number(commentMatch[1]),
          author: body.author || "Visual Reviewer",
          author_type: body.author ? "anonymous" : "user",
          content: body.content,
          parent_id: body.parent_id,
          status: "visible",
          is_visible: true,
          report_count: 0,
          created_at: "2026-09-15T10:00:00Z",
        });
      }

      if (method === "POST" && /^\/api\/comments\/\d+\/report$/.test(path)) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      unknown.push(`${method} ${path}`);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path === "/api/me/blog-session") return respond(adminProfile);
    if (path === "/api/me/notifications") {
      return respond({ list: notifications, total: notifications.length });
    }
    if (path === "/api/site") return respond(publicSiteSettings);
    if (path === "/api/pages/nav") return respond(publicNavPages);
    if (path === "/api/pages/about") return respond(aboutPage);
    if (path === "/api/pages/links") return respond(linksPage);
    if (path === "/api/pages/design-system") return respond(designSystemPage);
    if (path === "/api/categories") return respond(publicCategories);
    if (path === "/api/tags") return respond(publicTags);
    if (path === "/api/tags/summary") return respond(publicTagSummaries);

    if (path === "/api/posts") {
      const filtered = publicPosts.filter((post) =>
        matchesPost(post, url.searchParams),
      );
      return respond(paginated(filtered, url.searchParams));
    }

    const categoryMatch = path.match(/^\/api\/categories\/([^/]+)\/posts$/);
    if (categoryMatch) {
      const slug = decodeURIComponent(categoryMatch[1]);
      const filtered = publicPosts.filter(
        (post) =>
          post.category?.slug === slug && matchesPost(post, url.searchParams),
      );
      return respond(paginated(filtered, url.searchParams));
    }

    const communityMatch = path.match(/^\/api\/posts\/([^/]+)\/community$/);
    if (communityMatch) {
      const post = publicPosts.find(
        (item) => item.slug === decodeURIComponent(communityMatch[1]),
      );
      return respond({
        liked,
        likes_count: post?.id === 1 ? likes : post?.likes_count || 0,
      });
    }

    const relatedMatch = path.match(/^\/api\/posts\/([^/]+)\/related$/);
    if (relatedMatch) {
      const slug = decodeURIComponent(relatedMatch[1]);
      return respond(
        publicPosts.filter((post) => post.slug !== slug).slice(0, 2),
      );
    }

    const commentsMatch = path.match(/^\/api\/posts\/(\d+)\/comments$/);
    if (commentsMatch) {
      const postID = Number(commentsMatch[1]);
      return respond(postID === publicComment.post_id ? [publicComment] : []);
    }

    const postMatch = path.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch) {
      const slugOrID = decodeURIComponent(postMatch[1]);
      const post = publicPosts.find(
        (item) => item.slug === slugOrID || String(item.id) === slugOrID,
      );
      if (post) return respond(post);
      return respond(null, 404);
    }

    unknown.push(`${method} ${path}`);
    return respond(null);
  });

  return unknown;
}
