import { useEffect, useState } from "react";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
} from "../../config/site-defaults";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import { usePageTitle } from "../../hooks/usePageTitle";
import type { Category, Post, SiteSettings } from "../../types/blog";
import type { TagSummary } from "../../api/site";
export function usePublicHome() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tagSummaries, setTagSummaries] = useState<TagSummary[]>([]);
  const [site, setSite] = useState<SiteSettings>(
    () => getCachedSiteSettings() || DEFAULT_SITE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const handleRetry = () => setReloadKey((k) => k + 1);

  usePageTitle("", {
    brand: site.site_title,
    subtitle: site.site_description || site.default_seo_description,
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      postsApi.getPosts(new URLSearchParams({ page: "1", pageSize: "12" })),
      siteApi.getCategories().catch(() => []),
      siteApi.getPublishedTagSummaries().catch(() => []),
      siteApi.getSiteSettings().catch(() => DEFAULT_SITE_SETTINGS),
    ])
      .then(([postData, categoryData, tagData, siteData]) => {
        setPosts(postData.list || []);
        setCategories(categoryData || []);
        setTagSummaries(tagData || []);
        setSite({ ...DEFAULT_SITE_SETTINGS, ...siteData });
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  return { posts, categories, tagSummaries, site, loading, error, handleRetry };
}
