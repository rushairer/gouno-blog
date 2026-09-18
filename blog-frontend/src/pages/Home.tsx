import { Link } from "react-router-dom";
import { ArrowRight, GitBranch, Mail, Rss } from "lucide-react";
import { Alert, Button, Empty, Heading, Skeleton } from "@gouno/ui/core";
import { DEFAULT_SITE_SETTINGS, authorInitials } from "../config/site-defaults";
import { ArticleTeaser } from "../components/reading/ArticleTeaser";
import { usePublicHome } from "../features/public/usePublicHome";

function HomeLoading() {
  return (
    <div className="flex flex-col gap-10" role="status" aria-label="首页加载中">
      <div className="grid gap-6 border-b pb-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      </div>
      <Skeleton className="h-52 w-full" />
      <div className="grid gap-8 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

export default function Home() {
  const { posts, categories, tagSummaries, site, loading, error, handleRetry } =
    usePublicHome();

  if (loading) return <HomeLoading />;

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <section className="grid items-center gap-8 border-b pb-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <Heading
            level={1}
            variant="display"
            className="max-w-3xl whitespace-pre-line"
          >
            {site.hero_title || DEFAULT_SITE_SETTINGS.hero_title}
          </Heading>
          <p className="mt-5 max-w-2xl type-reading-lead text-muted-foreground">
            {site.hero_description ?? DEFAULT_SITE_SETTINGS.hero_description}
          </p>
        </div>
        {site.hero_image_url ? (
          <figure>
            <img
              src={site.hero_image_url}
              alt={
                site.hero_image_caption || "由模块、关系与路径组成的抽象系统图"
              }
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
            {site.hero_image_caption ? (
              <figcaption className="mt-2 type-caption text-muted-foreground">
                {site.hero_image_caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </section>

      {error ? (
        <div className="flex flex-col items-start gap-3">
          <Alert
            type="error"
            title="首页内容加载失败"
            description={error}
            showIcon
          />
          <Button onClick={handleRetry}>重试</Button>
        </div>
      ) : null}

      {!error && !posts.length ? (
        <Empty
          title="这里还没有文章"
          description="完成第一篇写作后，它会成为首页主角。"
        />
      ) : null}

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {posts[0] ? <ArticleTeaser post={posts[0]} featured /> : null}
          {posts.length > 1 ? (
            <section className="mt-10">
              <div className="mb-2 flex items-center justify-between gap-4">
                <Heading level={2} variant="subsection">
                  精选文章
                </Heading>
                <Link
                  className="inline-flex items-center gap-2 type-body-sm text-primary"
                  to="/articles"
                >
                  查看全部
                  <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="grid gap-x-8 md:grid-cols-2">
                {posts.slice(1, 5).map((post) => (
                  <ArticleTeaser post={post} key={post.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="flex flex-col gap-8 lg:sticky lg:top-24">
          {categories.length || tagSummaries.length ? (
            <section>
              <Heading level={2} variant="label" className="mb-5">
                主题索引
              </Heading>
              {categories.length ? (
                <div className="flex flex-col gap-3">
                  <Heading
                    level={3}
                    variant="micro"
                    className="text-muted-foreground"
                  >
                    核心分类
                  </Heading>
                  {categories.map((category) => (
                    <Link
                      className="flex items-center justify-between gap-3 type-body-sm hover:text-primary"
                      key={category.id}
                      to={`/categories/${encodeURIComponent(category.slug)}`}
                    >
                      <span>{category.name}</span>
                      <span className="type-caption tabular-nums text-muted-foreground">
                        {category.post_count || 0} 篇
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {tagSummaries.length ? (
                <div className="mt-6">
                  <Heading
                    level={3}
                    variant="micro"
                    className="mb-3 text-muted-foreground"
                  >
                    热门标签
                  </Heading>
                  <div className="flex flex-wrap gap-2">
                    {tagSummaries.slice(0, 16).map(({ name, post_count }) => (
                      <Link
                        key={name}
                        to={`/tags/${encodeURIComponent(name)}`}
                        className="rounded-md bg-muted px-2 py-1 type-caption hover:bg-accent"
                      >
                        {name}{" "}
                        <span className="text-muted-foreground">
                          {post_count}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          <section className="border-t pt-6">
            <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent type-weight-semibold text-primary">
              {authorInitials(site.author_name)}
            </span>
            <Heading level={2} variant="compact">
              {site.author_name}
            </Heading>
            <p className="mt-2 type-reading-sm text-muted-foreground">
              {site.author_bio}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 type-body-sm text-primary">
              <Link to="/about">关于本站</Link>
              {site.github_url ? (
                <a
                  className="inline-flex items-center gap-1"
                  href={site.github_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch className="size-4" />
                  GitHub
                </a>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      {posts.length ? (
        <section>
          <Heading level={2} variant="subsection" className="mb-2">
            最新文章
          </Heading>
          <div className="grid gap-x-10 md:grid-cols-2">
            {posts.slice(0, 8).map((post) => (
              <ArticleTeaser key={post.id} post={post} compact />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col justify-between gap-5 border-t pt-8 sm:flex-row sm:items-center">
        <div>
          <Heading level={2} variant="subsection">
            订阅更新
          </Heading>
          <p className="mt-2 type-body-sm text-muted-foreground">
            每当有新文章发布，都可以通过你熟悉的方式收到。
          </p>
        </div>
        <div className="flex gap-5 type-body-sm text-primary">
          <a
            className="inline-flex items-center gap-2"
            href={site.rss_url || "/feed.xml"}
          >
            <Rss className="size-4" />
            RSS
          </a>
          {site.email ? (
            <a
              className="inline-flex items-center gap-2"
              href={`mailto:${site.email}`}
            >
              <Mail className="size-4" />
              Email
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
