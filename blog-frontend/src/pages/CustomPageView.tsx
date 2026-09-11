import { useEffect, useMemo, useState } from "react";
import { GitBranch, Mail, Rss, ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
} from "../config/site-defaults";
import { pagesApi } from "../api/pages";
import { siteApi } from "../api/site";
import { extractMarkdownTOC } from "../utils/markdown";
import type { CustomPage, SiteSettings } from "../types/blog";
import { Alert, Card, Spinner } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import NotFound from "./NotFound";

export default function CustomPageView({ fixedSlug }: { fixedSlug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = fixedSlug || routeSlug || "";

  const [page, setPage] = useState<CustomPage | null>(null);
  const [site, setSite] = useState<SiteSettings>(
    () => getCachedSiteSettings() || DEFAULT_SITE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    siteApi
      .getSiteSettings()
      .then((settings) => setSite({ ...DEFAULT_SITE_SETTINGS, ...settings }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setNotFound(false);

    pagesApi
      .getPageBySlug(slug)
      .then((data) => {
        if (ignore) return;
        setPage(data);
      })
      .catch(() => {
        if (!ignore) {
          if (slug === "about") {
            setPage({
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
              created_at: new Date().toISOString(),
            });
          } else {
            setNotFound(true);
          }
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

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

  if (notFound) return <NotFound />;

  if (loading || !page) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner className="size-5 text-primary" />
        <span>正在载入页面…</span>
      </div>
    );
  }

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
    const markText =
      page.title.length > 4 ? page.title.slice(0, 4) : page.title;

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {draftBanner}
        <header className="flex flex-col items-start gap-6 border-b pb-8 sm:flex-row sm:items-center">
          <div
            className={`grid size-24 shrink-0 place-items-center rounded-full border-2 border-primary bg-card font-semibold text-primary ${markText.length > 2 ? "text-xl" : "text-3xl"}`}
          >
            {markText}
          </div>
          <div>
            <p className="text-xs font-medium tracking-wider text-muted-foreground">
              {(page.slug || "about").toUpperCase()} /{" "}
              {(
                site.site_title || DEFAULT_SITE_SETTINGS.site_title
              ).toUpperCase()}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {page.summary || page.title}
            </h1>
          </div>
        </header>
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <main className="min-w-0">
            <MarkdownRenderer content={page.content} />
          </main>
          <Card as="aside" className="self-start lg:sticky lg:top-24">
            <h2 className="font-semibold">订阅与联系</h2>
            {site.github_url ? (
              <a
                className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground hover:text-primary"
                href={site.github_url}
                target="_blank"
                rel="noreferrer"
              >
                <GitBranch className="size-4" /> GitHub
              </a>
            ) : null}
            {site.email ? (
              <a
                className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground hover:text-primary"
                href={`mailto:${site.email}`}
              >
                <Mail className="size-4" /> Email
              </a>
            ) : null}
            <a
              className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground hover:text-primary"
              href={site.rss_url || "/feed.xml"}
            >
              <Rss className="size-4" /> RSS
            </a>
          </Card>
        </div>
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

        {toc.length > 0 ? (
          <aside className="order-first self-start lg:order-none lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:[scrollbar-gutter:stable]">
            <Card className="gap-3 p-4">
              <h2 className="text-sm font-semibold">目录导航</h2>
              <nav className="flex flex-col gap-1" aria-label="目录导航">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-primary ${item.level > 2 ? "pl-5" : ""}`}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
