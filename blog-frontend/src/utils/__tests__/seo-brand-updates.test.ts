import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCachedSiteSettings } from "../../config/site-defaults";
import { useArticleSEO, type ArticleSEO } from "../seo";

vi.mock("../../api/site", () => ({
  siteApi: {
    getSiteSettings: vi.fn(async () => ({})),
  },
}));

const article: ArticleSEO = {
  title: "Stable Article",
  description: "Description for metadata",
  slug: "stable-article",
  publishedAt: "2026-10-15T00:00:00Z",
  tags: ["Go", "Security"],
};

function currentMeta(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

describe("useArticleSEO live site-title changes", () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = "Original Tab Title";
    setCachedSiteSettings({ site_title: "Initial Site" });
  });

  afterEach(() => {
    document.querySelectorAll('script[data-blog-seo="article"]').forEach((node) =>
      node.remove(),
    );
  });

  it("updates the mounted article title immediately after a site-settings event", () => {
    const { unmount } = renderHook(() => useArticleSEO(article));
    expect(document.title).toBe("Stable Article - Initial Site");
    expect(currentMeta('meta[property="og:title"]')).toBe("Stable Article");
    expect(currentMeta('meta[property="og:description"]')).toBe(
      "Description for metadata",
    );
    const canonical = new URL("/articles/stable-article", window.location.origin).toString();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(canonical);

    act(() => setCachedSiteSettings({ site_title: "Renamed Site" }));
    expect(document.title).toBe("Stable Article - Renamed Site");
    expect(currentMeta('meta[property="og:title"]')).toBe("Stable Article");
    expect(document.head.querySelectorAll('script[data-blog-seo="article"]')).toHaveLength(1);
    const structured = document.head.querySelector('script[data-blog-seo="article"]');
    expect(JSON.parse(structured?.textContent || "{}")).toMatchObject({
      headline: article.title,
      mainEntityOfPage: canonical,
    });

    unmount();
    expect(document.title).toBe("Original Tab Title");
    expect(document.head.querySelectorAll('script[data-blog-seo="article"]')).toHaveLength(0);
  });

  it("respects an explicit brand override and adopts the newest site title when removed", () => {
    const { rerender, unmount } = renderHook(
      ({ brand }: { brand: string | undefined }) => useArticleSEO(article, brand),
      { initialProps: { brand: "Editorial Brand" as string | undefined } },
    );
    expect(document.title).toBe("Stable Article - Editorial Brand");

    act(() => setCachedSiteSettings({ site_title: "New Global Brand" }));
    expect(document.title).toBe("Stable Article - Editorial Brand");

    rerender({ brand: "Updated Editorial Brand" });
    expect(document.title).toBe("Stable Article - Updated Editorial Brand");

    rerender({ brand: undefined });
    expect(document.title).toBe("Stable Article - New Global Brand");
    expect(document.head.querySelectorAll('script[data-blog-seo="article"]')).toHaveLength(1);

    unmount();
    expect(document.title).toBe("Original Tab Title");
  });

  it("leaves head metadata untouched without an article", () => {
    const { unmount } = renderHook(() => useArticleSEO(null));
    act(() => setCachedSiteSettings({ site_title: "Name Without Article" }));
    expect(document.title).toBe("Original Tab Title");
    expect(document.head.querySelectorAll('script[data-blog-seo="article"]')).toHaveLength(0);
    unmount();
  });
});
