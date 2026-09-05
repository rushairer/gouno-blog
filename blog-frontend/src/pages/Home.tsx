import { Link } from "react-router-dom";
import { ArrowRight, GitBranch, Mail, Rss } from "lucide-react";
import {
  Button,
  EmptyState,
  Feedback,
  SectionHeading,
  ArticleListSkeleton,
} from "@gouno/ui";
import { DEFAULT_SITE_SETTINGS, authorInitials } from "../config/site-defaults";
import { ArticleTeaser } from "../components/reading/ArticleTeaser";
import { usePublicHome } from "../features/public/usePublicHome";
export default function Home() {
  const { posts, categories, tagSummaries, site, loading, error, handleRetry } =
    usePublicHome();
  if (loading) return <ArticleListSkeleton />;
  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <section className="grid items-center gap-8 border-b pb-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h1 className="max-w-3xl whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight md:text-[40px]">
            {site.hero_title || DEFAULT_SITE_SETTINGS.hero_title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
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
              <figcaption className="mt-2 text-xs text-muted-foreground">
                {site.hero_image_caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </section>
      {error ? (
        <div className="flex flex-col gap-3">
          <Feedback type="error">{error}</Feedback>
          <Button onClick={handleRetry}>重试</Button>
        </div>
      ) : null}
      {!error && !posts.length ? (
        <EmptyState label="这里还没有文章。完成第一篇写作后，它会成为首页主角。" />
      ) : null}
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {posts[0] ? <ArticleTeaser post={posts[0]} featured /> : null}
          {posts.length > 1 ? (
            <section className="mt-10">
              <div className={`featured-layout featured-layout--${Math.min(posts.length - 1, 4)}`}>
              <SectionHeading
                title="精选文章"
                action={
                  <Link
                    className="inline-flex items-center gap-2 text-sm text-primary"
                    to="/articles"
                  >
                    查看全部
                    <ArrowRight className="size-4" />
                  </Link>
                }
              />
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
              <h2 className="mb-5 text-sm font-semibold">主题索引</h2>
              {categories.length ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs text-muted-foreground">核心分类</h3>
                  {categories.map((category) => (
                    <Link
                      className="flex items-center justify-between gap-3 text-sm hover:text-primary"
                      key={category.id}
                      to={`/categories/${encodeURIComponent(category.slug)}`}
                    >
                      <span>{category.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {category.post_count || 0} 篇
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {tagSummaries.length ? (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs text-muted-foreground">
                    热门标签
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tagSummaries.slice(0, 16).map(({ name, post_count }) => (
                      <Link
                        key={name}
                        to={`/tags/${encodeURIComponent(name)}`}
                        className="rounded-md bg-muted px-2 py-1 text-xs hover:bg-accent"
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
            <span className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent font-semibold text-primary">
              {authorInitials(site.author_name)}
            </span>
            <h2 className="font-semibold">{site.author_name}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {site.author_bio}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-primary">
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
          <SectionHeading title="最新文章" />
          <div className="grid gap-x-10 md:grid-cols-2">
            {posts.slice(0, 8).map((post) => (
              <ArticleTeaser key={post.id} post={post} compact />
            ))}
          </div>
        </section>
      ) : null}
      <section className="flex flex-col justify-between gap-5 border-t pt-8 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">订阅更新</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            每当有新文章发布，都可以通过你熟悉的方式收到。
          </p>
        </div>
        <div className="flex gap-5 text-sm text-primary">
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
