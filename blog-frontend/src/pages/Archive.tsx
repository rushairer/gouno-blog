import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState, PageHeader, Panel } from "@gouno/ui";
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
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
      <PageHeader
        title={t("archivePage.title")}
        description={
          <span>
            <span className="mr-2 text-xs font-medium uppercase tracking-wider text-primary">
              {t("archivePage.archiveMeta")}
            </span>
            {t("archivePage.subtitle")}
          </span>
        }
      />
      <Panel className="simple-page__body">
        {loading ? (
          <LoadingState label={t("archivePage.loading")} />
        ) : periods.length ? (
          <div className="flex flex-col gap-8">
            {periods.map(([period, items]) => (
              <section
                key={period}
                className="border-t pt-5 first:border-0 first:pt-0"
              >
                <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
                  {period}
                  <small className="text-xs font-normal text-muted-foreground">
                    {items.length}
                  </small>
                </h2>
                <div className="mt-3 divide-y">
                  {items.map((post) => (
                    <Link
                      key={post.id}
                      to={`/articles/${post.slug}`}
                      className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:text-primary"
                    >
                      <time className="text-xs font-mono text-muted-foreground">
                        {formatDate(post.published_at || post.created_at, {
                          day: "2-digit",
                        })}
                      </time>
                      <span className="truncate">{post.title}</span>
                      <small className="hidden text-xs text-muted-foreground sm:block">
                        {post.tags.slice(0, 2).join(" / ")}
                      </small>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState label={t("archivePage.empty")} />
        )}
      </Panel>
    </div>
  );
}
