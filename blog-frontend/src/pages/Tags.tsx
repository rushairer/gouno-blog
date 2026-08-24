import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState } from "../components/ui";
import { postsApi } from "../api/posts";
import { siteApi } from "../api/site";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Post } from "../types/blog";

export default function Tags() {
  usePageTitle("标签");
  const [tags, setTags] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      siteApi.getTags().catch(() => []),
      postsApi.getPosts(new URLSearchParams({ page: "1", pageSize: "100" })),
    ])
      .then(([tagData, postData]) => {
        setTags(tagData as string[]);
        setPosts(postData.list || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const tagCounts = useMemo(
    () =>
      tags.map((tag) => ({
        tag,
        count: posts.filter((post) => post.tags.includes(tag)).length,
      })),
    [posts, tags],
  );

  return (
    <div className="public-container simple-page taxonomy-page">
      <header>
        <p>TAGS / SIGNALS</p>
        <h1>标签</h1>
        <span>从具体技术与概念进入文章。</span>
      </header>
      <div className="simple-page__body">
        {loading ? (
          <LoadingState label="正在整理标签索引…" />
        ) : tagCounts.length ? (
          <div className="tag-index">
            {tagCounts
              .sort((a, b) => b.count - a.count)
              .map(({ tag, count }, index) => (
                <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{tag}</strong>
                  <small>{count} 篇</small>
                </Link>
              ))}
          </div>
        ) : (
          <EmptyState label="文章添加标签后会在这里形成内容索引。" />
        )}
      </div>
    </div>
  );
}
