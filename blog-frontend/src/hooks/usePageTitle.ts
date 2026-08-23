import { useEffect } from 'react';
import { DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { siteApi } from '../api/site';

interface TitleOptions {
  brand?: string;
  admin?: boolean;
  subtitle?: string;
  restoreOnUnmount?: boolean;
}

let cachedBrand = DEFAULT_SITE_SETTINGS.site_title;

siteApi.getSiteSettings().then((settings) => {
  if (settings?.site_title) {
    cachedBrand = settings.site_title;
  }
}).catch(() => {
  // Graceful fallback
});

export function usePageTitle(title?: string, options: TitleOptions = {}) {
  const {
    brand = cachedBrand,
    admin = false,
    subtitle,
    restoreOnUnmount = true,
  } = options;

  useEffect(() => {
    const previousTitle = document.title;
    const currentBrand = brand || cachedBrand || DEFAULT_SITE_SETTINGS.site_title;

    let targetTitle = '';
    if (admin) {
      targetTitle = title ? `${title} - ${currentBrand} 后台` : `${currentBrand} 管理后台`;
    } else if (subtitle) {
      targetTitle = title ? `${title} - ${currentBrand} - ${subtitle}` : `${currentBrand} - ${subtitle}`;
    } else if (title) {
      targetTitle = `${title} - ${currentBrand}`;
    } else {
      targetTitle = currentBrand;
    }

    document.title = targetTitle;

    return () => {
      if (restoreOnUnmount) {
        document.title = previousTitle;
      }
    };
  }, [title, brand, admin, subtitle, restoreOnUnmount]);
}
