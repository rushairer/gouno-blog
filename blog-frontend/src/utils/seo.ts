import { useEffect, useState } from "react";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
} from "../config/site-defaults";
import { siteApi } from "../api/site";

export interface ArticleSEO {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  tags: string[];
}

let cachedBrand =
  getCachedSiteSettings()?.site_title || DEFAULT_SITE_SETTINGS.site_title;

if (typeof window !== "undefined") {
  window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.site_title) cachedBrand = detail.site_title;
  });
}

siteApi
  .getSiteSettings()
  .then((settings) => {
    if (settings?.site_title) {
      cachedBrand = settings.site_title;
    }
  })
  .catch(() => {
    // Graceful fallback
  });

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  const existed = Boolean(element);
  const previousContent = element?.getAttribute("content");
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) =>
    element?.setAttribute(name, value),
  );
  return () => {
    if (!existed) {
      element?.remove();
    } else if (previousContent === null || previousContent === undefined) {
      element?.removeAttribute("content");
    } else {
      element?.setAttribute("content", previousContent);
    }
  };
}

export function useArticleSEO(article: ArticleSEO | null, brand?: string) {
  const [siteBrand, setSiteBrand] = useState(
    () => brand || cachedBrand || DEFAULT_SITE_SETTINGS.site_title,
  );

  useEffect(() => {
    if (brand) {
      setSiteBrand(brand);
      return;
    }
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.site_title) setSiteBrand(detail.site_title);
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    };
  }, [brand]);

  useEffect(() => {
    if (!article) return;
    const currentBrand =
      brand || siteBrand || cachedBrand || DEFAULT_SITE_SETTINGS.site_title;
    const canonicalURL = new URL(
      `/articles/${article.slug}`,
      window.location.origin,
    ).toString();
    const previousTitle = document.title;
    document.title = `${article.title} - ${currentBrand}`;

    const restoreMeta = [
      setMeta('meta[name="description"]', {
        name: "description",
        content: article.description,
      }),
      setMeta('meta[property="og:title"]', {
        property: "og:title",
        content: article.title,
      }),
      setMeta('meta[property="og:description"]', {
        property: "og:description",
        content: article.description,
      }),
      setMeta('meta[property="og:type"]', {
        property: "og:type",
        content: "article",
      }),
      setMeta('meta[property="og:url"]', {
        property: "og:url",
        content: canonicalURL,
      }),
      setMeta('meta[name="twitter:card"]', {
        name: "twitter:card",
        content: "summary",
      }),
    ];
    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const canonicalExisted = Boolean(canonical);
    const previousCanonical = canonical?.getAttribute("href");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalURL;

    const structuredData = document.createElement("script");
    structuredData.type = "application/ld+json";
    structuredData.dataset.blogSeo = "article";
    structuredData.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      description: article.description,
      datePublished: article.publishedAt,
      keywords: article.tags.join(", "),
      mainEntityOfPage: canonicalURL,
    });
    document.head.appendChild(structuredData);

    return () => {
      document.title = previousTitle;
      structuredData.remove();
      restoreMeta.forEach((restore) => restore());
      if (!canonicalExisted) canonical?.remove();
      else if (previousCanonical === null || previousCanonical === undefined)
        canonical?.removeAttribute("href");
      else canonical?.setAttribute("href", previousCanonical);
    };
  }, [article, brand]);
}
