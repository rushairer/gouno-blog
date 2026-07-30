import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../components/ui';
import { getPosts } from '../lib/blog-api';
import type { Post } from '../types/blog';

export default function Archive() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getPosts(new URLSearchParams({ page: '1', pageSize: '100' })).then((data) => setPosts(data.list || [])).finally(() => setLoading(false)); }, []);
  const groups = useMemo(() => posts.reduce<Record<string, Post[]>>((all, post) => {
    const date = new Date(post.published_at || post.created_at);
    const key = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
    (all[key] ||= []).push(post); return all;
  }, {}), [posts]);
  return <div className="public-container simple-page"><header><p>ARCHIVE / TIME</p><h1>归档</h1><span>把写作放回时间里，看到问题如何变化，判断如何形成。</span></header>{loading ? <LoadingState label="正在整理时间线…" /> : <div className="archive-list">{Object.entries(groups).map(([period, items]) => <section key={period}><h2>{period}<small>{items.length}</small></h2><div>{items.map((post) => <Link key={post.id} to={`/articles/${post.slug}`}><time>{new Date(post.published_at || post.created_at).toLocaleDateString('zh-CN', { day: '2-digit' })}</time><span>{post.title}</span><small>{post.tags.slice(0, 2).join(' / ')}</small></Link>)}</div></section>)}</div>}</div>;
}

