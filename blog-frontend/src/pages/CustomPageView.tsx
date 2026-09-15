import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GitBranch, Mail, Rss, ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { ApiError } from "@gosso/client";
import { Alert, Anchor, Button, Card, Result, Skeleton } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { pagesApi } from "../api/pages";
import { siteApi } from "../api/site";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
} from "../config/site-defaults";
import type { CustomPage, SiteSettings } from "../types/blog";
import { extractMarkdownTOC } from "../utils/markdown";
import NotFound from "./NotFound";

function isNotFoundError(reason: unknown) {
  return reason instanceof ApiError && reason.status === 404;
}

function fallbackAboutPage(): CustomPage {
  return {
    id: 0,
    title: "关于",
    slug: "about",
    summary: "关于这个站点，以及持续写作的理由。",
    content:
      "这里用于记录值得长期保存的问题、过程与结论。比起只给答案，更重视交代上下文、约束和选择的理由。",
    template: "about",
    status: "published",
    allow_comments: false,
    show_in_nav: true,
    sort_order: 10,
    created_at: "1970-01-01T00:00:00.000Z",
  };
}

function CustomPageLoading() {
  return (
    <Card
      padding="none"
      className="mx-auto w-full max-w-[900px] overflow-hidden"
      role="status"
      aria-label="自定义单页加载中"
    >
      <div className="space-y-6 p-6 sm:p-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-px w-full" />
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton
            key={index}
            className={`h-4 ${index % 3 === 0 ? "w-full" : "w-5/6"}`}
          />
        ))}
      </div>
    </Card>
  );
}

function DocumentSurface({
  page,
  children,
}: {
  page: CustomPage;
  children: ReactNode;
}) {
  return (
    <Card
      as="article"
      padding="none"
      className="mx-auto w-full max-w-[900px] overflow-hidden"
    >
      <div className="space-y-7 p-6 sm:p-8">
        <PageHeader title={page.title} description={page.summary} />
        <div className="space-y-6 text-[15px] leading-8 text-foreground sm:text-base">
          {children}
        </div>
      </div>
    </Card>
  );
}

export default function CustomPageView({ fixedSlug }: { fixedSlug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = fixedSlug || routeSlug || "";

  const [page, setPage] = useState<CustomPage | null>(null);
  const [site, setSite] = useState<SiteSettings>(
    () => getCachedSiteSettings() || DEFAULT_SITE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    siteApi
      .getSiteSettings()
      .then((settings) => setSite({ ...DEFAULT_SITE_SETTINGS, ...settings }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) {
      setPage(null);
      setError(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setPage(null);
    setError(null);
    setNotFound(false);

    pagesApi
      .getPageBySlug(slug)
      .then((data) => {
        if (ignore) return;
        setPage(data);
      })
      .catch((reason: unknown) => {
        if (ignore) return;

        if (isNotFoundError(reason)) {
          if (slug === "about") {
            setPage(fallbackAboutPage());
          } else {
            setNotFound(true);
          }
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : "公开单页接口暂时不可用，请稍后重试。",
        );
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    if (page) {
      const pageTitle = page.seo_title || page.title;
      document.title = `${pageTitle} - ${site.site_title || DEFAULT_SITE_SETTINGS.site_title}`;

      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute(
        "content",
        page.seo_description || page.summary || site.site_description || "",
      );
    }
  }, [page, site]);

  const toc = useMemo(
    () => (page?.content ? extractMarkdownTOC(page.content) : []),
    [page?.content],
  );

  if (loading) return <CustomPageLoading />;

  if (error) {
    return (
      <Card
        padding="none"
        variant="subtle"
        className="mx-auto w-full max-w-[900px]"
      >
        <Result
          role="alert"
          status="error"
          headingLevel={1}
          title="页面载入失败"
          description={error}
          extra={
            <Button
              variant="solid"
              color="primary"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              重试
            </Button>
          }
        />
      </Card>
    );
  }

  if (notFound || !page) return <NotFound />;

  const draftBanner =
    page.status === "draft" ? (
      <Alert
        type="info"
        showIcon
        icon={<ShieldAlert size={16} />}
        role="status"
      >
        <strong>管理员预览模式</strong> · 该单页当前为草稿状态，仅对管理员可见。
      </Alert>
    ) : null;

  if (page.template === "about") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {draftBanner}
        <DocumentSurface page={page}>
          <MarkdownRenderer content={page.content} />
          <section aria-labelledby="about-contact" className="space-y-3">
            <h2
              id="about-contact"
              className="text-2xl font-semibold tracking-tight"
            >
              订阅与联系
            </h2>
            <div className="flex flex-wrap gap-4 text-sm">
              {site.github_url ? (
                <a
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
                  href={site.github_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch className="size-4" /> GitHub
                </a>
              ) : null}
              {site.email ? (
                <a
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
                  href={`mailto:${site.email}`}
                >
                  <Mail className="size-4" /> Email
                </a>
              ) : null}
              <a
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
                href={site.rss_url || "/feed.xml"}
              >
                <Rss className="size-4" /> RSS
              </a>
            </div>
          </section>
        </DocumentSurface>
      </div>
    );
  }

  if (page.template === "blank") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {draftBanner}
        <MarkdownRenderer content={page.content} />
      </div>
    );
  }

  if (page.template === "links") {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {draftBanner}
        <PageHeader title={page.title} description={page.summary} />
        <Card as="section">
          <MarkdownRenderer content={page.content} />
        </Card>
      </div>
    );
  }

  if (page.template === "timeline") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {draftBanner}
        <PageHeader
          title={page.title}
          description={page.summary}
          actions={
            <span className="text-xs font-semibold tracking-wider text-primary">
              TIMELINE / ROADMAP
            </span>
          }
        />
        <Card as="section">
          <MarkdownRenderer content={page.content} />
        </Card>
      </div>
    );
  }

  if (page.template === "projects") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {draftBanner}
        <PageHeader
          title={page.title}
          description={page.summary}
          actions={
            <span className="text-xs font-semibold tracking-wider text-primary">
              PORTFOLIO / SHOWCASE
            </span>
          }
        />
        <Card as="section">
          <MarkdownRenderer content={page.content} />
        </Card>
      </div>
    );
  }

  if (page.template === "focus") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {draftBanner}
        <PageHeader
          title={page.title}
          description={page.summary}
          actions={
            <span className="text-xs font-semibold tracking-wider text-primary">
              ESSAY & FOCUS
            </span>
          }
        />
        <Card as="section">
          <MarkdownRenderer content={page.content} />
        </Card>
      </div>
    );
  }

  if (page.template === "faq") {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {draftBanner}
        <PageHeader
          title={page.title}
          description={page.summary}
          actions={
            <span className="text-xs font-semibold tracking-wider text-primary">
              FAQ / GUIDES
            </span>
          }
        />
        <Card as="section">
          <MarkdownRenderer content={page.content} />
        </Card>
      </div>
    );
  }

  const tocItems = toc.map((item) => ({
    key: item.id,
    title:
      item.level > 2 ? <span className="pl-3">{item.text}</span> : item.text,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {draftBanner}
      <div
        className={`grid min-w-0 gap-8 ${toc.length === 0 ? "mx-auto w-full max-w-3xl" : "lg:grid-cols-[minmax(0,1fr)_16rem]"}`}
      >
        <Card as="article" className="gap-8">
          <PageHeader title={page.title} description={page.summary} />
          <MarkdownRenderer content={page.content} />
        </Card>

        {tocItems.length > 0 ? (
          <aside className="order-first self-start lg:order-none lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:[scrollbar-gutter:stable]">
            <Card className="gap-3 p-4">
              <h2 className="text-sm font-semibold">目录导航</h2>
              <Anchor items={tocItems} aria-label="目录导航" />
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
