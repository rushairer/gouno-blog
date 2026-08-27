import { useEffect } from "react";
import { siteApi } from "../api/site";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  SITE_SETTINGS_STORAGE_KEY,
  SITE_SETTINGS_UPDATED_EVENT,
} from "../config/site-defaults";
import type { SiteSettings } from "../types/blog";

function faviconType(url: string) {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "";
}

export function applySiteMetadata(settings: Partial<SiteSettings>) {
  const favicon = settings.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url;
  const faviconLink =
    document.head.querySelector<HTMLLinkElement>("#site-favicon") ||
    document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (faviconLink && favicon) {
    faviconLink.href = favicon;
    const type = faviconType(favicon);
    if (type) faviconLink.type = type;
    else faviconLink.removeAttribute("type");
  }

  const description =
    settings.default_seo_description ||
    settings.site_description ||
    DEFAULT_SITE_SETTINGS.default_seo_description;
  const descriptionMeta = document.head.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (descriptionMeta && description) descriptionMeta.content = description;

  // Route-level title hooks take precedence. This only replaces the static HTML fallback.
  const currentTitle = document.title;
  const defaultTitle = DEFAULT_SITE_SETTINGS.site_title;
  if (
    !currentTitle ||
    currentTitle === defaultTitle ||
    currentTitle === "Gouno Blog"
  ) {
    document.title =
      settings.default_seo_title || settings.site_title || defaultTitle;
  }
}

export function useSiteMetadata() {
  useEffect(() => {
    // 1. Synchronously apply cached settings on mount to prevent any flash
    const initial = getCachedSiteSettings() || DEFAULT_SITE_SETTINGS;
    applySiteMetadata(initial);

    // 2. Revalidate in background
    siteApi
      .getSiteSettings()
      .then(applySiteMetadata)
      .catch(() => {
        // The static defaults keep the initial document metadata usable during API outages.
      });

    // 3. Listen to local and cross-tab settings updates
    const handleUpdate = (event: Event) => {
      const fresh =
        (event as CustomEvent<SiteSettings>).detail || getCachedSiteSettings();
      if (fresh) applySiteMetadata(fresh);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SITE_SETTINGS_STORAGE_KEY && event.newValue) {
        try {
          applySiteMetadata(JSON.parse(event.newValue));
        } catch {}
      }
    };

    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);
}
