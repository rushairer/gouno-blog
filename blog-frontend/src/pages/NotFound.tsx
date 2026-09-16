import { ArrowLeft, FileText, Home, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";
import { Button, ButtonLink, Card, Result } from "@gouno/ui/core";

export default function NotFound() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  usePageTitle(t("notFound.pageTitle"));

  const labels =
    locale === "zh"
      ? {
          home: "返回首页",
          articles: "浏览文章",
          search: "搜索内容",
          back: "返回上一页",
        }
      : {
          home: "Back home",
          articles: "Browse articles",
          search: "Search content",
          back: "Go back",
        };

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
                {labels.home}
              </ButtonLink>
              <ButtonLink variant="outline" to="/articles" icon={<FileText />}>
                {labels.articles}
              </ButtonLink>
              <ButtonLink variant="text" to="/search" icon={<Search />}>
                {labels.search}
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
          {labels.back}
        </Button>
      </div>
    </>
  );
}
