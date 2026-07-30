import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState } from '../components/ui';
import { getCategories, getPosts, getTags } from '../lib/blog-api';
import type { Category, Post } from '../types/blog';

export default function TaxonomyIndex({ type }: { type: 'categories' | 'tags' }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const taxonomy = type === 'categories' ? getCategories().catch(() => []) : getTags();
    Promise.all([taxonomy, getPosts(new URLSearchParams({ page: '1', pageSize: '100' }))])
      .then(([data, postData]) => {
        if (type === 'categories') setCategories(data as Category[]);
        else setTags(data as string[]);
        setPosts(postData.list || []);
      }).finally(() => setLoading(false));
  }, [type]);
  const tagCounts = useMemo(() => tags.map((tag) => ({ tag, count: posts.filter((post) => post.tags.includes(tag)).length })), [posts, tags]);
  return <div className="public-container simple-page taxonomy-page"><header><p>{type === 'categories' ? 'CATEGORIES / FIELDS' : 'TAGS / SIGNALS'}</p><h1>{type === 'categories' ? '分类' : '标签'}</h1><span>{type === 'categories' ? '围绕长期问题建立内容脉络。' : '从具体技术与概念进入文章。'}</span></header>{loading ? <LoadingState label="正在整理内容索引…" /> : type === 'categories' ? categories.length ? <div className="category-grid">{categories.map((item, index) => <Link to={`/categories/${item.slug}`} key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><h2>{item.name}</h2><p>{item.description || '查看这个主题下的全部文章与实践记录。'}</p><div>{item.post_count || 0} 篇文章 <ArrowRight /></div></Link>)}</div> : <EmptyState label="分类模型已经就绪，创建第一个分类后会在这里出现。" /> : <div className="tag-index">{tagCounts.sort((a, b) => b.count - a.count).map(({ tag, count }, index) => <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{tag}</strong><small>{count} 篇</small></Link>)}</div>}</div>;
}

