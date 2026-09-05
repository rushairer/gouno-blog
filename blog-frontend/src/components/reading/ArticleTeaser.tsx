import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@gouno/ui";
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
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
          <h2
            className={cn(
              "break-words font-semibold leading-snug tracking-tight group-hover/title:text-primary",
              featured
                ? "text-2xl md:text-3xl"
                : compact
                  ? "text-base"
                  : "text-xl",
            )}
          >
            {post.title}
          </h2>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
        </Link>
        <p
          className={cn(
            "mt-3 text-sm leading-7 text-muted-foreground",
            compact ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {markdownToPlainText(post.summary)}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-primary">
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
