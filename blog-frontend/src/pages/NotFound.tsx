import { BookOpen, FileText, FolderTree, Home, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";
import { Button, Input } from "@gouno/ui";

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useI18n();
  usePageTitle(t("notFound.pageTitle"));

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q");
    if (query && String(query).trim()) {
      navigate(`/search?q=${encodeURIComponent(String(query).trim())}`);
    }
  };

  return (
    <div className="public-container not-found-page">
      <div className="not-found-card">
        <div className="not-found-badge">
          <span className="not-found-code">404</span>
          <span className="not-found-badge__dot">/</span>
          <span className="not-found-badge__label">{t("notFound.badge")}</span>
        </div>

        <h1 className="not-found-title">{t("notFound.heading")}</h1>
        <p className="not-found-subtitle">{t("notFound.description")}</p>

        <form className="not-found-search" onSubmit={handleSearch}>
          <Search className="not-found-search__icon" />
          <Input
            name="q"
            type="search"
            aria-label={t("searchPosts")}
            placeholder={t("notFound.searchPlaceholder")}
            autoComplete="off"
          />
          <Button type="submit" className="not-found-search__btn">
            {t("notFound.searchButton")}
          </Button>
        </form>

        <div className="not-found-nav">
          <span className="not-found-nav__label">
            {t("notFound.suggestedLinks")}
          </span>
          <div className="not-found-nav__links">
            <Link to="/" className="not-found-nav__item">
              <Home />
              <span>{t("nav.home")}</span>
            </Link>
            <Link to="/articles" className="not-found-nav__item">
              <BookOpen />
              <span>{t("notFound.allArticles")}</span>
            </Link>
            <Link to="/categories" className="not-found-nav__item">
              <FolderTree />
              <span>{t("notFound.contentCategories")}</span>
            </Link>
            <Link to="/archive" className="not-found-nav__item">
              <FileText />
              <span>{t("notFound.siteArchive")}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
