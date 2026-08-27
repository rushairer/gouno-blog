import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState } from "../components/ui";
import { postsApi } from "../api/posts";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";
import { PAGINATION_LIMITS } from "../constants";
import type { Post } from "../types/blog";

export default function Archive() {
  const { t, formatDate } = useI18n();
  usePageTitle(t("archivePage.title"));
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postsApi
      .getPosts(
        new URLSearchParams({
          page: "1",
          pageSize: String(PAGINATION_LIMITS.RUNS_PAGE_SIZE),
        }),
      )
      .then((data) => setPosts(data.list || []))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(
    () =>
      posts.reduce<Record<string, Post[]>>((all, post) => {
        const date = new Date(post.published_at || post.created_at);
        const key = formatDate(date.toISOString(), {
          year: "numeric",
          month: "long",
        });
        (all[key] ||= []).push(post);
        return all;
      }, {}),
    [posts, formatDate],
  );
  const periods = Object.entries(groups);
  return (
    <div className="public-container simple-page">
      <header>
        <p>{t("archivePage.archiveMeta")}</p>
        <h1>{t("archivePage.title")}</h1>
        <span>{t("archivePage.subtitle")}</span>
      </header>
      <div className="simple-page__body">
        {loading ? (
          <LoadingState label={t("archivePage.loading")} />
        ) : periods.length ? (
          <div className="archive-list">
            {periods.map(([period, items]) => (
              <section key={period}>
                <h2>
                  {period}
                  <small>{items.length}</small>
                </h2>
                <div>
                  {items.map((post) => (
                    <Link key={post.id} to={`/articles/${post.slug}`}>
                      <time>
                        {formatDate(post.published_at || post.created_at, {
                          day: "2-digit",
                        })}
                      </time>
                      <span>{post.title}</span>
                      <small>{post.tags.slice(0, 2).join(" / ")}</small>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState label={t("archivePage.empty")} />
        )}
      </div>
    </div>
  );
}
