import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Empty } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { postsApi } from "../api/posts";
import { siteApi } from "../api/site";
import { DiscoveryIndexLoading } from "../components/reading/DiscoveryIndexLoading";
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
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      siteApi.getTags(),
      postsApi.getPosts(
        new URLSearchParams({
          page: "1",
          pageSize: String(PAGINATION_LIMITS.RUNS_PAGE_SIZE),
        }),
      ),
    ])
      .then(([tagData, postData]) => {
        setTags(tagData || []);
        setPosts(postData.list || []);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t("requestFailed"));
      })
      .finally(() => setLoading(false));
  }, [reloadKey, t]);

  const tagCounts = useMemo(
    () =>
      tags
        .map((tag) => ({
          tag,
          count: posts.filter((post) => post.tags.includes(tag)).length,
        }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
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
      <Card as="section" aria-label={`${t("tagsPage.title")}内容`}>
        {loading ? (
          <DiscoveryIndexLoading page="tags" />
        ) : error ? (
          <Alert
            type="error"
            title={`${t("tagsPage.title")}加载失败`}
            description={error}
            action={<Button onClick={() => setReloadKey((value) => value + 1)}>{t("retry")}</Button>}
            showIcon
          />
        ) : tagCounts.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tagCounts.map(({ tag, count }, index) => (
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
          <Empty
            icon={<Inbox className="size-5 text-muted-foreground" />}
            title={t("tagsPage.empty")}
          />
        )}
      </Card>
    </div>
  );
}
