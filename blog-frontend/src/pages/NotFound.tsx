import { ArrowLeft, FileText, Home, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";
import { Button, ButtonLink, Card, Result } from "@gouno/ui/core";

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useI18n();
  usePageTitle(t("notFound.pageTitle"));

  return (
    <>
      <Card padding="none" variant="subtle" className="mx-auto max-w-[760px]">
        <Result
          status="info"
          headingLevel={1}
          title={t("notFound.heading")}
          description={t("notFound.description")}
          extra={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink
                variant="solid"
                color="primary"
                to="/"
                icon={<Home />}
              >
                {t("nav.home")}
              </ButtonLink>
              <ButtonLink variant="outline" to="/articles" icon={<FileText />}>
                {t("notFound.allArticles")}
              </ButtonLink>
              <ButtonLink variant="text" to="/search" icon={<Search />}>
                {t("searchPosts")}
              </ButtonLink>
            </div>
          }
        />
      </Card>

      <div className="mx-auto mt-6 flex max-w-[760px] justify-center">
        <Button
          variant="text"
          icon={<ArrowLeft />}
          onClick={() => navigate(-1)}
        >
          {t("back")}
        </Button>
      </div>
    </>
  );
}
