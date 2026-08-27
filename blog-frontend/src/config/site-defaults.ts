import type { SiteSettings } from "../types/blog";
import { STORAGE_KEYS } from "../constants";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site_title: "Gouno Blog",
  site_description: "记录、思考与分享。",
  author_name: "站点作者",
  author_bio: "欢迎来到我的博客。",
  email: "",
  github_url: "",
  rss_url: "/feed.xml",
  default_seo_title: "Gouno Blog",
  default_seo_description: "记录、思考与分享。",
  footer_text: "Built with care, code, and curiosity.",
  hero_title: "记录探索与思考，\n沉淀见解与价值。",
  hero_description:
    "专注于长期记录、深度思考与知识沉淀。写下探索的过程，也分享有价值的见解。",
  hero_image_url: "/editorial-system-map.png",
  hero_image_caption: "EXPLORE / THINK / SHARE",
  favicon_url: "/favicon.svg",
};

export const SITE_SETTINGS_STORAGE_KEY = STORAGE_KEYS.SITE_SETTINGS;
export const SITE_SETTINGS_UPDATED_EVENT = "gouno-blog:site-settings-updated";

export function getCachedSiteSettings(): SiteSettings | null {
  try {
    const raw = localStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SiteSettings;
  } catch {
    return null;
  }
}

export function setCachedSiteSettings(settings: Partial<SiteSettings>): void {
  try {
    const merged = {
      ...DEFAULT_SITE_SETTINGS,
      ...(getCachedSiteSettings() || {}),
      ...settings,
    };
    localStorage.setItem(SITE_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(
      new CustomEvent(SITE_SETTINGS_UPDATED_EVENT, { detail: merged }),
    );
  } catch {
    // Ignore storage errors in restricted browser contexts
  }
}

export function authorInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "站点";
}
