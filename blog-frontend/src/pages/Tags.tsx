import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState } from "@gouno/ui";
import { postsApi } from "../api/posts";
import { siteApi } from "../api/site";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";
import { PAGINATION_LIMITS } from "../constants";
import type { Post } from "../types/blog";

export default function Tags() {
  const { t } = useI18n();
  usePageTitle(t("tagsPage.title"));
  const [tags, setTags] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      siteApi.getTags().catch(() => []),
      postsApi.getPosts(
        new URLSearchParams({
          page: "1",
          pageSize: String(PAGINATION_LIMITS.RUNS_PAGE_SIZE),
        }),
      ),
    ])
      .then(([tagData, postData]) => {
        setTags(tagData as string[]);
        setPosts(postData.list || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const tagCounts = useMemo(
    () =>
      tags.map((tag) => ({
        tag,
        count: posts.filter((post) => post.tags.includes(tag)).length,
      })),
    [posts, tags],
  );

  return (
    <div className="public-container simple-page taxonomy-page">
      <header className="taxonomy-header">
        <p>{t("tagsPage.tagsMeta")}</p>
        <h1>{t("tagsPage.title")}</h1>
        <span>{t("tagsPage.subtitle")}</span>
      </header>
      <div className="simple-page__body">
        {loading ? (
          <LoadingState label={t("tagsPage.loading")} />
        ) : tagCounts.length ? (
          <div className="tag-index">
            {tagCounts
              .sort((a, b) => b.count - a.count)
              .map(({ tag, count }, index) => (
                <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{tag}</strong>
                  <small>{t("tagsPage.postCount", { count })}</small>
                </Link>
              ))}
          </div>
        ) : (
          <EmptyState label={t("tagsPage.empty")} />
        )}
      </div>
    </div>
  );
}
