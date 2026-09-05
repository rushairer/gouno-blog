import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Search } from "lucide-react";
import {
  ArticleListSkeleton,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Pagination,
  SearchField,
  Field,
} from "@gouno/ui";
import { postsApi } from "../api/posts";
import { siteApi } from "../api/site";
import { ArticleTeaser } from "../components/reading/ArticleTeaser";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Post } from "../types/blog";

export default function ArticleIndex({
  mode = "articles",
}: {
  mode?: "articles" | "search" | "tag" | "category";
}) {
  const [params, setParams] = useSearchParams();
  const routeParams = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = mode === "search" ? params.get("q") || "" : params.get("q") || "";
  const tag = mode === "tag" ? routeParams.slug || "" : params.get("tag") || "";
  const category =
    mode === "category" ? routeParams.slug || "" : params.get("category") || "";

  const title =
    mode === "search"
      ? q
        ? `“${q}”的搜索结果`
        : "搜索文章"
      : mode === "tag"
        ? `标签：${tag}`
        : mode === "category"
          ? `分类：${category}`
          : "全部文章";
  const [reloadKey, setReloadKey] = useState(0);
  const handleRetry = () => setReloadKey((k) => k + 1);

  usePageTitle(title);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q) query.set("search", q);
    if (tag) query.set("tag", tag);
    if (category) query.set("category", category);
    Promise.all([
      category
        ? postsApi.getCategoryPosts(category, query)
        : postsApi.getPosts(query),
      siteApi.getTags(),
    ])
      .then(([result, nextTags]) => {
        setPosts(result.list || []);
        setTotal(result.total || 0);
        setTags(nextTags || []);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [page, q, tag, category, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {total} 篇文章，持续记录问题、选择与实现。
        </p>
      </header>
      <section aria-label="筛选" className="flex flex-col gap-4 border-y py-5">
        <form
          className="flex max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            navigate(
              `/search?q=${encodeURIComponent(String(data.get("q") || ""))}`,
            );
          }}
        >
          <Field label="关键词" className="flex-1">
            <SearchField
              id="article-search"
              name="q"
              defaultValue={q}
              aria-label="搜索文章"
            />
          </Field>
          <Button type="submit" className="self-end" icon={<Search />}>
            搜索
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">标签</span>
          <Link
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
            to="/articles"
          >
            全部
          </Link>
          {tags.slice(0, 18).map((item) => (
            <Link
              aria-current={item === tag ? "page" : undefined}
              className="rounded-md border px-3 py-1 text-sm hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:bg-accent"
              key={item}
              to={`/tags/${encodeURIComponent(item)}`}
            >
              {item}
            </Link>
          ))}
        </div>
      </section>
      <section aria-live="polite" className="mx-auto w-full max-w-[900px]">
        {loading ? (
          <ArticleListSkeleton />
        ) : error ? (
          <ErrorState
            title="文章载入失败"
            description={error}
            action={<Button onClick={handleRetry}>重试</Button>}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            label="没有找到符合条件的文章。"
            action={
              <>
                <ButtonLink to="/articles">浏览全部文章</ButtonLink>
                <ButtonLink to="/archive">浏览归档</ButtonLink>
              </>
            }
          />
        ) : (
          posts.map((post) => <ArticleTeaser key={post.id} post={post} />)
        )}
        {!loading && total > 10 ? (
          <Pagination
            page={page}
            pages={pages}
            label="文章分页"
            onChange={(nextPage) => {
              const next = new URLSearchParams(params);
              next.set("page", String(nextPage));
              setParams(next);
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              });
            }}
          />
        ) : null}
      </section>
      <span className="sr-only">{location.pathname}</span>
    </div>
  );
}
