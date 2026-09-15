import { useEffect, useState } from "react";
import { ArrowRight, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Empty } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { siteApi } from "../api/site";
import { DiscoveryIndexLoading } from "../components/reading/DiscoveryIndexLoading";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";
import type { Category } from "../types/blog";

export default function Categories() {
  const { t } = useI18n();
  usePageTitle(t("categoriesPage.title"));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    siteApi
      .getCategories()
      .then((items) => setCategories(items || []))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t("requestFailed"));
      })
      .finally(() => setLoading(false));
  }, [reloadKey, t]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
      <PageHeader
        title={t("categoriesPage.title")}
        description={
          <span>
            <span className="mr-2 text-xs font-medium uppercase tracking-wider text-primary">
              {t("categoriesPage.categoryMeta")}
            </span>
            {t("categoriesPage.subtitle")}
          </span>
        }
      />
      <Card as="section" aria-label={`${t("categoriesPage.title")}内容`}>
        {loading ? (
          <DiscoveryIndexLoading page="categories" />
        ) : error ? (
          <Alert
            type="error"
            title={`${t("categoriesPage.title")}加载失败`}
            description={error}
            action={
              <Button onClick={() => setReloadKey((value) => value + 1)}>
                {t("retry")}
              </Button>
            }
            showIcon
          />
        ) : categories.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((item, index) => (
              <Link
                to={`/categories/${encodeURIComponent(item.slug)}`}
                key={item.id}
                className="group rounded-lg border p-5 transition-colors hover:border-primary hover:bg-accent/40"
              >
                <span className="text-xs font-mono text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-3 text-lg font-semibold tracking-tight group-hover:text-primary">
                  {item.name}
                </h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
                  {item.description || t("categoriesPage.defaultDescription")}
                </p>
                <div className="mt-5 flex items-center justify-between text-sm text-primary">
                  {t("categoriesPage.postCount", {
                    count: item.post_count || 0,
                  })}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            icon={<Inbox className="size-5 text-muted-foreground" />}
            title={t("categoriesPage.empty")}
          />
        )}
      </Card>
    </div>
  );
}
