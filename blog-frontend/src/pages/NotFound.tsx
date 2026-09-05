import { BookOpen, FileText, FolderTree, Home, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";
import { Button, ButtonLink, Input, PageHeader, Panel } from "@gouno/ui";

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
    <div className="flex min-h-[55vh] items-center justify-center">
      <Panel className="mx-auto w-full max-w-3xl items-center px-5 py-10 text-center sm:px-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <span>404</span>
          <span aria-hidden="true">/</span>
          <span>{t("notFound.badge")}</span>
        </div>
        <PageHeader
          title={t("notFound.heading")}
          description={t("notFound.description")}
          className="w-full items-center justify-center text-center md:items-center md:justify-center [&>div]:text-center"
        />

        <form
          className="flex w-full max-w-lg items-center gap-2"
          onSubmit={handleSearch}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <Input
            className="min-w-0 flex-1"
            name="q"
            type="search"
            aria-label={t("searchPosts")}
            placeholder={t("notFound.searchPlaceholder")}
            autoComplete="off"
          />
          <Button type="submit" variant="primary">
            {t("notFound.searchButton")}
          </Button>
        </form>

        <div className="flex w-full flex-col items-center gap-4 border-t pt-6">
          <span className="text-xs text-muted-foreground">
            {t("notFound.suggestedLinks")}
          </span>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            <ButtonLink variant="secondary" to="/" icon={<Home />}>
              {t("nav.home")}
            </ButtonLink>
            <ButtonLink variant="secondary" to="/articles" icon={<BookOpen />}>
              {t("notFound.allArticles")}
            </ButtonLink>
            <ButtonLink
              variant="secondary"
              to="/categories"
              icon={<FolderTree />}
            >
              {t("notFound.contentCategories")}
            </ButtonLink>
            <ButtonLink variant="secondary" to="/archive" icon={<FileText />}>
              {t("notFound.siteArchive")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}
