import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState, PageHeader, Panel } from "@gouno/ui";
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
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
      <PageHeader
        title={t("tagsPage.title")}
        description={
          <span>
            <span className="mr-2 text-xs font-medium uppercase tracking-wider text-primary">
              {t("tagsPage.tagsMeta")}
            </span>
            {t("tagsPage.subtitle")}
          </span>
        }
      />
      <Panel className="simple-page__body">
        {loading ? (
          <LoadingState label={t("tagsPage.loading")} />
        ) : tagCounts.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tagCounts
              .sort((a, b) => b.count - a.count)
              .map(({ tag, count }, index) => (
                <Link
                  key={tag}
                  to={`/tags/${encodeURIComponent(tag)}`}
                  className="group flex items-center gap-4 rounded-md border px-4 py-3 hover:border-primary hover:bg-accent/40"
                >
                  <span className="text-xs font-mono text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong className="min-w-0 flex-1 truncate group-hover:text-primary">
                    {tag}
                  </strong>
                  <small className="text-xs text-muted-foreground">
                    {t("tagsPage.postCount", { count })}
                  </small>
                </Link>
              ))}
          </div>
        ) : (
          <EmptyState label={t("tagsPage.empty")} />
        )}
      </Panel>
    </div>
  );
}
