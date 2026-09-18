import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@gouno/ui";
import { Heading } from "@gouno/ui/core";
import { markdownToPlainText } from "../../utils/markdown";
import type { Post } from "../../types/blog";

export function ArticleTeaser({
  post,
  featured = false,
  compact = false,
}: {
  post: Post;
  featured?: boolean;
  compact?: boolean;
}) {
  const readTime = Math.max(
    3,
    Math.ceil((post.content?.length || post.summary.length) / 500),
  );

  return (
    <article
      className={cn(
        "group grid min-w-0 gap-5 border-b py-6",
        post.cover_url && !compact && "sm:grid-cols-[minmax(0,1fr)_180px]",
      )}
    >
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-muted-foreground">
          <time dateTime={post.published_at || post.created_at}>
            {new Date(post.published_at || post.created_at).toLocaleDateString(
              "zh-CN",
            )}
          </time>
          <span>{readTime} 分钟阅读</span>
        </div>
        <Link
          to={`/articles/${post.slug}`}
          className="group/title inline-flex items-start gap-2"
        >
          <Heading
            level={2}
            variant={featured ? "hero" : compact ? "compact" : "section"}
            className="break-words group-hover/title:text-primary"
          >
            {post.title}
          </Heading>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
        </Link>
        <p
          className={cn(
            "mt-3 type-reading-sm text-muted-foreground",
            compact ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {markdownToPlainText(post.summary)}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 type-caption text-primary">
          {post.tags.slice(0, compact ? 3 : post.tags.length).map((tag) => (
            <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>
              {tag}
            </Link>
          ))}
        </div>
      </div>
      {post.cover_url && !compact ? (
        <Link
          to={`/articles/${post.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="self-center"
        >
          <img
            src={post.cover_url}
            alt={post.cover_alt || post.title}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-md object-cover"
          />
        </Link>
      ) : null}
    </article>
  );
}
