import { useEffect } from 'react';
import { siteApi } from '../api/site';
import { DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import type { SiteSettings } from '../types/blog';

function faviconType(url: string) {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return '';
}

export function applySiteMetadata(settings: SiteSettings) {
  const favicon = settings.favicon_url || DEFAULT_SITE_SETTINGS.favicon_url;
  const faviconLink = document.head.querySelector<HTMLLinkElement>('#site-favicon')
    || document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (faviconLink && favicon) {
    faviconLink.href = favicon;
    const type = faviconType(favicon);
    if (type) faviconLink.type = type;
    else faviconLink.removeAttribute('type');
  }

  const description = settings.default_seo_description || settings.site_description || DEFAULT_SITE_SETTINGS.default_seo_description;
  const descriptionMeta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (descriptionMeta && description) descriptionMeta.content = description;

  // Route-level title hooks take precedence. This only replaces the static HTML fallback.
  if (document.title === DEFAULT_SITE_SETTINGS.site_title) {
    document.title = settings.default_seo_title || settings.site_title || DEFAULT_SITE_SETTINGS.site_title;
  }
}

export function useSiteMetadata() {
  useEffect(() => {
    applySiteMetadata(DEFAULT_SITE_SETTINGS);
    siteApi.getSiteSettings().then(applySiteMetadata).catch(() => {
      // The static defaults keep the initial document metadata usable during API outages.
    });
  }, []);
}
