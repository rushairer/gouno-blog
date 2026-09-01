import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import {
  ButtonLink,
  EmptyState,
  Feedback,
  LoadingState,
  Pagination,
  SearchField,
} from "../components/ui";
import { postsApi } from "../api/posts";
import { siteApi } from "../api/site";
import { markdownToPlainText } from "../utils/markdown";
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
  }, [page, q, tag, category]);

  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="public-container index-page">
      <header className="index-header">
        <p>ARTICLES / INDEX</p>
        <h1>{title}</h1>
        <span>{total} 篇文章，持续记录问题、选择与实现。</span>
      </header>
      <div className="index-layout">
        <aside className="index-filters">
          <h2>
            <SlidersHorizontal /> 筛选
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              navigate(
                `/search?q=${encodeURIComponent(String(data.get("q") || ""))}`,
              );
            }}
          >
            <label htmlFor="article-search">关键词</label>
            <SearchField
              id="article-search"
              name="q"
              defaultValue={q}
              size="regular"
              aria-label="搜索文章"
            />
          </form>
          <h3>标签</h3>
          <div className="filter-tags">
            <Link className={!tag ? "active" : ""} to="/articles">
              全部
            </Link>
            {tags.slice(0, 18).map((item) => (
              <Link
                className={item === tag ? "active" : ""}
                key={item}
                to={`/tags/${encodeURIComponent(item)}`}
              >
                {item}
              </Link>
            ))}
          </div>
        </aside>
        <section className="article-results" aria-live="polite">
          {loading ? (
            <LoadingState label="正在载入文章…" />
          ) : error ? (
            <Feedback type="error">{error}</Feedback>
          ) : posts.length === 0 ? (
            <EmptyState
              label="没有找到符合条件的文章。"
              action={
                <>
                  <ButtonLink variant="secondary" to="/articles">
                    浏览全部文章
                  </ButtonLink>
                  <ButtonLink variant="secondary" to="/archive">
                    浏览归档
                  </ButtonLink>
                </>
              }
            />
          ) : (
            posts.map((post, index) => (
              <article
                className={`article-index-row ${post.cover_url ? "article-index-row--has-cover" : ""}`}
                key={post.id}
              >
                <span>
                  {String((page - 1) * 10 + index + 1).padStart(2, "0")}
                </span>
                <div>
                  <Link to={`/articles/${post.slug}`}>
                    <h2>{post.title}</h2>
                  </Link>
                  <p>{markdownToPlainText(post.summary)}</p>
                  <div>
                    {post.tags.map((item) => (
                      <Link key={item} to={`/tags/${encodeURIComponent(item)}`}>
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
                {post.cover_url ? (
                  <Link
                    className="article-index-cover-link"
                    to={`/articles/${post.slug}`}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <img
                      className="article-index-cover"
                      src={post.cover_url}
                      alt={post.cover_alt || post.title}
                      loading="lazy"
                    />
                  </Link>
                ) : null}
                <div>
                  <time>
                    {new Date(
                      post.published_at || post.created_at,
                    ).toLocaleDateString("zh-CN")}
                  </time>
                  <span>
                    {Math.max(3, Math.ceil((post.content?.length || 0) / 500))}{" "}
                    分钟
                  </span>
                  <Link
                    to={`/articles/${post.slug}`}
                    aria-label={`阅读 ${post.title}`}
                  >
                    <ArrowRight />
                  </Link>
                </div>
              </article>
            ))
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
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : null}
        </section>
      </div>
      <span className="sr-only">{location.pathname}</span>
    </div>
  );
}
