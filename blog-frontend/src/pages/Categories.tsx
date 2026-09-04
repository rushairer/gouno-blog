import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState } from "../components/ui";
import { siteApi } from "../api/site";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";
import type { Category } from "../types/blog";

export default function Categories() {
  const { t } = useI18n();
  usePageTitle(t("categoriesPage.title"));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    siteApi
      .getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="public-container simple-page taxonomy-page">
      <header className="taxonomy-header">
        <p>{t("categoriesPage.categoryMeta")}</p>
        <h1>{t("categoriesPage.title")}</h1>
        <span>{t("categoriesPage.subtitle")}</span>
      </header>
      <div className="simple-page__body">
        {loading ? (
          <LoadingState label={t("categoriesPage.loading")} />
        ) : categories.length ? (
          <div className="category-grid">
            {categories.map((item, index) => (
              <Link to={`/categories/${item.slug}`} key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h2>{item.name}</h2>
                <p>
                  {item.description || t("categoriesPage.defaultDescription")}
                </p>
                <div>
                  {t("categoriesPage.postCount", {
                    count: item.post_count || 0,
                  })}{" "}
                  <ArrowRight />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState label={t("categoriesPage.empty")} />
        )}
      </div>
    </div>
  );
}
