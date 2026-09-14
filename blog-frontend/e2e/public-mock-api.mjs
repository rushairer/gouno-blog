import { adminProfile } from "./session-fixtures.mjs";
import {
  aboutPage,
  linksPage,
  publicCategories,
  publicComment,
  publicNavPages,
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

export async function installPublicApiFixtures(page) {
  const unknown = [];

  await page.route(productApiUrl, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method !== "GET" && method !== "HEAD") {
      if (/^\/api\/posts\/\d+\/view$/.test(path)) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      unknown.push(`${method} ${path}`);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const respond = async (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: envelope(data),
      });

    if (path === "/api/me/blog-session") return respond(adminProfile);
    if (path === "/api/site") return respond(publicSiteSettings);
    if (path === "/api/pages/nav") return respond(publicNavPages);
    if (path === "/api/pages/about") return respond(aboutPage);
    if (path === "/api/pages/links") return respond(linksPage);
    if (path === "/api/categories") return respond(publicCategories);
    if (path === "/api/tags") return respond(publicTags);
    if (path === "/api/tags/summary") return respond(publicTagSummaries);

    if (path === "/api/posts") {
      const filtered = publicPosts.filter((post) => matchesPost(post, url.searchParams));
      return respond(paginated(filtered, url.searchParams));
    }

    const categoryMatch = path.match(/^\/api\/categories\/([^/]+)\/posts$/);
    if (categoryMatch) {
      const slug = decodeURIComponent(categoryMatch[1]);
      const filtered = publicPosts.filter(
        (post) => post.category?.slug === slug && matchesPost(post, url.searchParams),
      );
      return respond(paginated(filtered, url.searchParams));
    }

    const communityMatch = path.match(/^\/api\/posts\/([^/]+)\/community$/);
    if (communityMatch) {
      const post = publicPosts.find(
        (item) => item.slug === decodeURIComponent(communityMatch[1]),
      );
      return respond({
        liked: false,
        likes_count: post?.likes_count || 0,
      });
    }

    const relatedMatch = path.match(/^\/api\/posts\/([^/]+)\/related$/);
    if (relatedMatch) {
      const slug = decodeURIComponent(relatedMatch[1]);
      return respond(publicPosts.filter((post) => post.slug !== slug).slice(0, 2));
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
